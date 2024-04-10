/**
 * Implementation of the @telefrek/query packages
 */

import { QueryError } from "@telefrek/query/error.js"
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
} from "@telefrek/query/index.js"
import {
  type CteClause,
  type DeleteClause,
  type InsertClause,
  type JoinQueryNode,
  type SQLNodeType,
  type SQLQueryNode,
  type SelectClause,
  type SetClause,
  type UpdateClause,
} from "@telefrek/query/sql/ast.js"
import {
  type FilterGroup,
  type FilterTypes,
} from "@telefrek/query/sql/filtering.js"
import {
  CteNodeManager,
  DeleteNodeManager,
  InsertNodeManager,
  JoinNodeManager,
  SelectNodeManager,
  UpdateNodeManager,
  getTreeRoot,
  hasProjections,
} from "@telefrek/query/sql/helpers.js"
import { DefaultSQLNodeBuilder } from "@telefrek/query/sql/internal.js"
import type { SQLNodeBuilder } from "@telefrek/query/sql/queryBuilder.js"
import {
  IsArrayFilter,
  isBranchNode,
  isColumnFilter,
  isCteClause,
  isDeleteClause,
  isFilterGroup,
  isInsertClause,
  isJoinQueryNode,
  isSQLQueryNode,
  isSelectClause,
  isUpdateClause,
} from "@telefrek/query/sql/typeGuards.js"
import type {
  RelationalQueryBuilder,
  SQLDataStore,
} from "@telefrek/query/sql/types.js"
import type { PostgresQuery, QueryMaterializer } from "./index.js"

export function createPostgresQueryBuilder<
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
  queryMaterializer: QueryMaterializer
}

type PostgresContext = PostgresStaticContext | PostgresDynamicContext

type ParametizedPostgresQuery<
  R extends RowType,
  P extends QueryParameters,
> = ParameterizedQuery<R, P> & PostgresQuery<unknown[]>

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

      const postgresQuery: PostgresQuery = {
        mode,
        name,
        text: (context as PostgresStaticContext).queryString!,
      }

      let parameterized: ParametizedPostgresQuery<R, P> | undefined

      if (context.materializer === "static") {
        // Do we need parameters?
        if (context.parameterMapping.size > 0) {
          // Setup the materializer...
          postgresQuery.materializer = (parameters: QueryParameters) => {
            return {
              text: postgresQuery.text,
              values: Array.from(context.parameterMapping.keys())
                .sort(
                  (a, b) =>
                    context.parameterMapping.get(a)! -
                    context.parameterMapping.get(b)!,
                )
                .map((k) => parameters[k]),
            }
          }

          parameterized = {
            ...postgresQuery,
            queryType: QueryType.PARAMETERIZED,
            bind: (parameters: P) => {
              return bindQuery(postgresQuery, parameters)
            },
          }
        } else {
          return {
            queryType: QueryType.SIMPLE,
            ...postgresQuery,
          } as never
        }
      } else {
        postgresQuery.materializer = context.queryMaterializer
        parameterized = {
          ...postgresQuery,
          queryType: QueryType.PARAMETERIZED,
          bind: (parameters: P) => {
            return bindQuery(postgresQuery, parameters)
          },
        }
      }

      return parameterized as never
    }

    throw new QueryError("Invalid query node, expected SQLQueryNode")
  }
}

function bindQuery<R extends RowType, P extends QueryParameters>(
  query: PostgresQuery,
  parameters: P,
): BoundQuery<R, P> & PostgresQuery<unknown[]> {
  const { text, values } = query.materializer!(parameters)

  return {
    parameters,
    name: query.name!,
    mode: query.mode,
    text,
    values: values,
    queryType: QueryType.BOUND,
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
      } else if (isDeleteClause(node)) {
        context.queryString = translateDelete(node, context)
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
    if (isCteClause(current)) {
      info.projections.push(current)
      current = new CteNodeManager(current).children?.at(0)
    } else if (isBranchNode(current)) {
      info.queryNode = current
      break
    } else {
      break
    }
  }

  return info
}

function translateUpdate(
  update: UpdateClause,
  context: PostgresStaticContext,
): string {
  const manager = new UpdateNodeManager(update)

  return `UPDATE ${manager.tableName} SET ${manager.updates.map((s) => translateSetColumns(s, context)).join(",")}
        ${manager.where ? ` WHERE ${translateFilterGroup(manager.where.filter, context)}` : ""}
        ${manager.returning ? ` RETURNING ${manager.returning === "*" ? "*" : manager.returning.join(",")}` : ""}`
}

function translateDelete(
  clause: DeleteClause,
  context: PostgresStaticContext,
): string {
  const manager = new DeleteNodeManager(clause)

  return `DELETE FROM ${manager.tableName}${manager.where ? ` WHERE ${translateFilterGroup(manager.where.filter, context)}` : ""}
        ${manager.returning ? ` RETURNING ${manager.returning === "*" ? "*" : manager.returning.join(",")}` : ""}`
}

function translateInsert(insert: InsertClause): PostgresContext {
  const manager = new InsertNodeManager(insert)

  const tableName = manager.tableName
  const returning = manager.returning

  if (insert.columns) {
    const parameterMapping: Map<string, number> = new Map()
    for (let n = 0; n < insert.columns.length; ++n) {
      parameterMapping.set(insert.columns[n], n + 1)
    }

    return {
      materializer: "static",
      parameterMapping,
      queryString: `
      INSERT INTO ${tableName}(${insert.columns.join(",")}) 
        VALUES(${insert.columns.map((_, idx) => `$${idx + 1}`).join(",")})
        ${returning ? ` RETURNING ${returning === "*" ? "*" : returning.join(",")}` : ""}`,
    } as PostgresStaticContext
  }

  const insertMaterializer = (
    p: QueryParameters,
  ): { text: string; values?: unknown[] } => {
    const columns = Object.keys(p)

    const queryString = `
      INSERT INTO ${tableName}(${columns.join(",")}) 
        VALUES(${columns.map((_, idx) => `$${idx + 1}`).join(",")})
        ${returning ? ` RETURNING ${returning === "*" ? "*" : returning.join(",")}` : ""}`

    return { text: queryString, values: columns.map((c) => p[c]) as unknown[] }
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
