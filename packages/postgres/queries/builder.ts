/**
 * Implementation of the @telefrek/query packages
 */

import { QueryError } from "@telefrek/query/error"
import {
  ExecutionMode,
  QueryType,
  type BoundQuery,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryNode,
  type QueryParameters,
  type RowType,
  type SimpleQuery,
} from "@telefrek/query/index"
import {
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isInsertClause,
  isJoinQueryNode,
  isParameterNode,
  isSQLQueryNode,
  isTableQueryNode,
  isUpdateClause,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type InsertClause,
  type JoinQueryNode,
  type SQLNodeType,
  type SQLQueryNode,
  type SetClause,
  type TableQueryNode,
  type UpdateClause,
} from "@telefrek/query/sql/ast"
import type { SQLNodeBuilder } from "@telefrek/query/sql/builder/index"
import { DefaultSQLNodeBuilder } from "@telefrek/query/sql/builder/internal"
import {
  CteNodeManager,
  JoinNodeManager,
  TableNodeManager,
  getTreeRoot,
  hasProjections,
} from "@telefrek/query/sql/helpers"
import type {
  RelationalQueryBuilder,
  SQLDataStore,
} from "@telefrek/query/sql/index"

export function createPostgresQueryContext<
  Database extends SQLDataStore,
>(): SQLNodeBuilder<Database, QueryType.SIMPLE> {
  return new DefaultSQLNodeBuilder<Database, QueryType.SIMPLE>(
    QueryType.SIMPLE,
    new PostgresQueryBuilder(),
  )
}

type PostgresStaticContext = {
  materializer: "static"
  parameterMapping: Map<string, number>
  queryString?: string
}

type PostgresDynamicContext = {
  materializer: "dynamic"
  queryMaterializer: (parameters: QueryParameters) => [string, unknown[]]
}

type PostgresContext = PostgresStaticContext | PostgresDynamicContext

type PostgresQuery = {
  context: PostgresContext
}

type SimplePostgresQuery<R extends RowType> = PostgresQuery & SimpleQuery<R>

type ParametizedPostgresQuery<
  R extends RowType,
  P extends QueryParameters,
> = PostgresQuery & ParameterizedQuery<R, P>

type BoundPostgresQuery<
  R extends RowType,
  P extends QueryParameters,
> = PostgresQuery & BoundQuery<R, P>

function isPostgresContext(context: object): context is PostgresContext {
  return (
    "materializer" in context &&
    typeof context.materializer === "string" &&
    (context.materializer === "static" || context.materializer === "dynamic")
  )
}

export function isPostgresQuery(query: unknown): query is PostgresQuery {
  return (
    typeof query === "object" &&
    query !== null &&
    "context" in query &&
    typeof query.context === "object" &&
    query.context !== null &&
    isPostgresContext(query.context)
  )
}

export class PostgresQueryBuilder<D extends SQLDataStore>
  implements RelationalQueryBuilder<D>
{
  build<
    Q extends BuildableQueryTypes,
    R extends RowType,
    P extends QueryParameters,
  >(
    node: QueryNode,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    if (isSQLQueryNode(node)) {
      const context = translateNode(getTreeRoot(node))

      const simple: SimplePostgresQuery<R> = {
        queryType: QueryType.SIMPLE,
        name,
        mode,
        context,
      }

      if (queryType === QueryType.SIMPLE) {
        return simple as never
      }

      const parameterized: ParametizedPostgresQuery<R, P> = {
        ...simple,
        queryType: QueryType.PARAMETERIZED,
        bind: (p: P): BoundQuery<R, P> => {
          return {
            parameters: p,
            context,
            name,
            mode,
            queryType: QueryType.BOUND,
          } as BoundPostgresQuery<R, P>
        },
      }

      return parameterized as never
    }

    throw new QueryError("Invalid query node, expected SQLQueryNode")
  }
}

export function cleanQuery(query?: string): string | undefined {
  return query?.trim().replace(/\s\s+/g, " ")
}

function translateJoinQuery(
  node: JoinQueryNode,
  context: PostgresStaticContext,
): string {
  const manager = new JoinNodeManager(node)

  const tables = manager.tables

  const select = tables
    .map((t) => new TableNodeManager(t))
    .map((tm) => {
      const alias = tm.columnAlias.reduce(
        (m, v) => m.set(v.column, v.alias),
        new Map(),
      )
      const columns = tm.select.columns

      if (columns === "*") {
        return `${tm.tableName}.*`
      } else {
        return columns
          .sort()
          .map((c) =>
            alias.has(c)
              ? `${tm.tableName}.${c} AS ${alias.get(c)}`
              : `${tm.tableName}.${c}`,
          )
          .join(", ")
      }
    })
    .join(", ")

  let from = ""
  const filters = manager.filters
  const seen: string[] = []
  for (const filter of filters) {
    if (!seen.includes(filter.left)) {
      from += `${filter.left}`
      seen.push(filter.left)
    }

    from += ` JOIN ${filter.right} ON ${filter.left}.${filter.filter.leftColumn} = ${filter.right}.${filter.filter.rightColumn}`
  }

  const where = tables
    .map((t) => new TableNodeManager(t))
    .map((tm) => {
      const where = tm.where
      if (where) {
        return translateFilterGroup(where.filter, context, tm.tableName)
      }

      return ""
    })
    .filter((s) => s.length > 0)
    .join(", ")

  return `SELECT ${select} FROM ${from}${where ? ` WHERE ${where}` : ""}`
}

function translateTableQuery(
  node: TableQueryNode,
  context: PostgresStaticContext,
): string {
  const manager = new TableNodeManager(node)

  const select = manager.select

  const aliasing: Map<string, string> = manager.columnAlias
    ? manager.columnAlias.reduce(
        (temp, alias) => temp.set(alias.column, alias.alias),
        new Map<string, string>(),
      )
    : new Map<string, string>()

  return `SELECT ${
    select
      ? select.columns !== "*"
        ? select.columns
            .map((c) => (aliasing.has(c) ? `${c} AS ${aliasing.get(c)!}` : c))
            .join(", ")
        : "*"
      : "*"
  } FROM ${node.tableName}${
    manager.tableAlias ? `AS ${manager.tableAlias}` : ""
  }${
    manager.where
      ? ` WHERE ${translateFilterGroup(manager.where.filter, context)}`
      : ""
  }`
}

function translateNode(node: SQLQueryNode<SQLNodeType>): PostgresContext {
  // Assume we're using a static context (most cases...)
  const context: PostgresContext = {
    materializer: "static",
    parameterMapping: new Map(),
  }

  if (hasProjections(node)) {
    const info = extractProjections(node)

    const CTE = `WITH ${info.projections
      .filter(isCteClause)
      .map((c) => translateCte(c, context))
      .join(", ")}`

    context.queryString = `${CTE} ${
      isTableQueryNode(info.queryNode)
        ? translateTableQuery(info.queryNode, context)
        : isJoinQueryNode(info.queryNode)
          ? translateJoinQuery(info.queryNode, context)
          : "error"
    }`

    return context
  } else {
    if (isInsertClause(node)) {
      return translateInsert(node)
    } else {
      if (isTableQueryNode(node)) {
        context.queryString = translateTableQuery(node, context)
      } else if (isJoinQueryNode(node)) {
        context.queryString = translateJoinQuery(node, context)
      } else if (isUpdateClause(node)) {
        context.queryString = translateUpdate(node, context)
      } else {
        throw new QueryError("Unsupported type!")
      }
    }
  }

  return context
}

interface ProjectionInfo {
  projections: SQLQueryNode<SQLNodeType>[]
  aliasing: Map<keyof SQLDataStore["tables"], SQLQueryNode<SQLNodeType>>
  queryNode: SQLQueryNode<SQLNodeType>
}

function extractProjections(root: SQLQueryNode<SQLNodeType>): ProjectionInfo {
  const info: ProjectionInfo = {
    projections: [],
    queryNode: root,
    aliasing: new Map(),
  }

  let current: SQLQueryNode<SQLNodeType> | undefined = root
  while (current) {
    // Terminal cases
    if (isTableQueryNode(current) || isJoinQueryNode(current)) {
      info.queryNode = current
      return info
    }

    if (isCteClause(current)) {
      info.projections.push(current)
      current = new CteNodeManager(current).child
    }
  }

  return info
}

function translateUpdate(
  update: UpdateClause,
  context: PostgresStaticContext,
): string {
  return `UPDATE ${update.tableName} SET ${update.setColumns.map((s) => translateSetColumns(s, context)).join(",")}${update.filter ? ` WHERE ${translateFilterGroup(update.filter, context)}` : ""}
        ${update.returning ? ` RETURNING ${update.returning === "*" ? "*" : update.returning.join(",")}` : ""}`
}

function translateInsert(insert: InsertClause): PostgresContext {
  const tableName = insert.tableName
  const returning = insert.returning

  const insertMaterializer = (p: QueryParameters): [string, unknown[]] => {
    const columns = Object.keys(p)

    const queryString = `
      INSERT INTO ${tableName}(${columns.join(",")}) 
        VALUES(${columns.map((_, idx) => `$${idx + 1}`).join(",")})
        ${returning ? ` RETURNING ${returning === "*" ? "*" : returning.join(",")}` : ""}`

    return [queryString, columns.map((c) => p[c])]
  }

  return {
    materializer: "dynamic",
    queryMaterializer: insertMaterializer,
  }
}

function translateCte(cte: CteClause, context: PostgresStaticContext): string {
  return `${cte.tableName} AS (${
    isTableQueryNode(cte.source)
      ? translateTableQuery(cte.source, context)
      : isJoinQueryNode(cte.source)
        ? translateJoinQuery(cte.source, context)
        : "error"
  })`
}

function translateSetColumns(
  setClause: SetClause,
  context: PostgresStaticContext,
): string {
  if (setClause.source === "parameter") {
    if (!context.parameterMapping.has(setClause.value.name)) {
      context.parameterMapping.set(
        setClause.value.name,
        context.parameterMapping.size + 1,
      )
    }

    return `${setClause.column} = $${context.parameterMapping.get(setClause.value.name)!.toString()}`
  }

  return `${setClause.column} = ${setClause.source === "null" ? "NULL" : wrap(setClause.value)}`
}

function translateFilterGroup(
  filter: FilterGroup | FilterTypes,
  context: PostgresStaticContext,
  table?: string,
): string {
  if (isFilterGroup(filter)) {
    return filter.filters
      .map((f) => translateFilterGroup(f, context, table))
      .join(` ${filter.op} `)
      .trimEnd()
  } else if (isColumnFilter(filter)) {
    if (filter.source === "null") {
      return `${table ? `${table}.` : ""}${filter.column} IS NULL`
    }

    if (isParameterNode(filter.value)) {
      if (!context.parameterMapping.has(filter.value.name)) {
        context.parameterMapping.set(
          filter.value.name,
          context.parameterMapping.size + 1,
        )
      }

      return `${table ? `${table}.` : ""}${filter.column} ${
        filter.op
      } $${context.parameterMapping.get(filter.value.name)!.toString()}`
    }

    return `${table ? `${table}.` : ""}${filter.column} ${
      filter.op
    } ${wrap(filter.value)}`
  } else if (IsArrayFilter(filter)) {
    if (isParameterNode(filter.value)) {
      if (!context.parameterMapping.has(filter.value.name)) {
        context.parameterMapping.set(
          filter.value.name,
          context.parameterMapping.size + 1,
        )
      }
      return `$${context.parameterMapping.get(filter.value.name)!.toString()} && ${table ? `${table}.` : ""}${
        filter.column
      }`
    }

    return `${wrap(Array.isArray(filter.value) ? filter.value : [filter.value])} && ${table ? `${table}.` : ""}${
      filter.column
    }`
  }

  throw new QueryError("Unsupported query filter type")
}

function wrap(value: unknown): string {
  return typeof value === "string"
    ? `'${value}$'`
    : typeof value === "object"
      ? value === null
        ? "null"
        : Array.isArray(value)
          ? `'{${value.map((i) => JSON.stringify(i)).join(",")}}'`
          : `'${JSON.stringify(value)}'`
      : (value as string)
}
