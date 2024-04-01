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
  type CteClause,
  type InsertClause,
  type JoinQueryNode,
  type SQLNodeType,
  type SQLQueryNode,
  type SelectClause,
  type SetClause,
  type UpdateClause,
} from "@telefrek/query/sql/ast"
import {
  type FilterGroup,
  type FilterTypes,
} from "@telefrek/query/sql/ast/filtering"
import {
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isInsertClause,
  isJoinQueryNode,
  isSQLQueryNode,
  isSelectClause,
  isUpdateClause,
} from "@telefrek/query/sql/ast/typeGuards"
import type { SQLNodeBuilder } from "@telefrek/query/sql/builder/index"
import { DefaultSQLNodeBuilder } from "@telefrek/query/sql/builder/internal"
import {
  CteNodeManager,
  InsertNodeManager,
  JoinNodeManager,
  SelectNodeManager,
  UpdateNodeManager,
  getTreeRoot,
  hasProjections,
} from "@telefrek/query/sql/helpers"
import type {
  RelationalQueryBuilder,
  SQLDataStore,
} from "@telefrek/query/sql/index"
import { getDebugInfo } from "../../core/index"

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
    .map((t) => new SelectNodeManager(t as SelectClause))
    .map((tm) => {
      const alias = tm.columnAlias
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
    .map((t) => new SelectNodeManager(t as SelectClause))
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

function translateSelectQuery(
  node: SelectClause,
  context: PostgresStaticContext,
): string {
  const manager = new SelectNodeManager(node)

  const select = manager.select

  const aliasing = manager.columnAlias

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
      isSelectClause(info.queryNode)
        ? translateSelectQuery(info.queryNode, context)
        : isJoinQueryNode(info.queryNode)
          ? translateJoinQuery(info.queryNode, context)
          : "error"
    }`

    return context
  } else {
    if (isInsertClause(node)) {
      return translateInsert(node)
    } else {
      if (isSelectClause(node)) {
        context.queryString = translateSelectQuery(node, context)
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
    if (isSelectClause(current) || isJoinQueryNode(current)) {
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
  const manager = new UpdateNodeManager(update)

  return `UPDATE ${manager.tableName} SET ${manager.updates.map((s) => translateSetColumns(s, context)).join(",")}${manager.where ? ` WHERE ${translateFilterGroup(manager.where.filter, context)}` : ""}
        ${manager.returning ? ` RETURNING ${manager.returning === "*" ? "*" : manager.returning.join(",")}` : ""}`
}

function translateInsert(insert: InsertClause): PostgresContext {
  const manager = new InsertNodeManager(insert)

  const tableName = manager.tableName
  const returning = manager.returning

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
    isSelectClause(cte.source)
      ? translateSelectQuery(cte.source, context)
      : isJoinQueryNode(cte.source)
        ? translateJoinQuery(cte.source, context)
        : "error"
  })`
}

function translateSetColumns(
  setClause: SetClause,
  context: PostgresStaticContext,
): string {
  if (setClause.type === "parameter") {
    if (!context.parameterMapping.has(setClause.name)) {
      context.parameterMapping.set(
        setClause.name,
        context.parameterMapping.size + 1,
      )
    }

    return `${setClause.column} = $${context.parameterMapping.get(setClause.name)!.toString()}`
  }

  return `${setClause.column} = ${setClause.type === "null" ? "NULL" : wrap(setClause.value)}`
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
    if (filter.type === "null") {
      return `${table ? `${table}.` : ""}${filter.column} IS NULL`
    }

    if (filter.type === "parameter") {
      if (!context.parameterMapping.has(filter.name)) {
        context.parameterMapping.set(
          filter.name,
          context.parameterMapping.size + 1,
        )
      }

      return `${table ? `${table}.` : ""}${filter.column} ${
        filter.op
      } $${context.parameterMapping.get(filter.name)!.toString()}`
    }

    return `${table ? `${table}.` : ""}${filter.column} ${
      filter.op
    } ${wrap(filter.value)}`
  } else if (IsArrayFilter(filter)) {
    if (filter.type === "parameter") {
      if (!context.parameterMapping.has(filter.name)) {
        context.parameterMapping.set(
          filter.name,
          context.parameterMapping.size + 1,
        )
      }
      return `$${context.parameterMapping.get(filter.name)!.toString()} && ${table ? `${table}.` : ""}${
        filter.column
      }`
    }

    return `${wrap(Array.isArray(filter.value) ? filter.value : [filter.value])} && ${table ? `${table}.` : ""}${
      filter.column
    }`
  }

  console.log(getDebugInfo(filter))
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
