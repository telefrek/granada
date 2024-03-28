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
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type InsertClause,
  type JoinQueryNode,
  type SQLNodeType,
  type SQLQueryNode,
  type TableQueryNode,
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

type PostgresQuery = {
  queryText: string
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

export function isPostgresQuery(query: unknown): query is PostgresQuery {
  return (
    typeof query === "object" &&
    query !== null &&
    "queryText" in query &&
    typeof query.queryText === "string"
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
      const context: PostgresContext = {
        parameterMapping: new Map(),
      }

      const queryText = translateNode(getTreeRoot(node), context)

      const simple: SimplePostgresQuery<R> = {
        queryType: QueryType.SIMPLE,
        name,
        mode,
        queryText,
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
            queryText,
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

type PostgresContext = {
  parameterMapping: Map<string, number>
}

function translateJoinQuery(
  node: JoinQueryNode,
  context: PostgresContext,
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
  context: PostgresContext,
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

function translateNode(
  node: SQLQueryNode<SQLNodeType>,
  context: PostgresContext,
): string {
  if (hasProjections(node)) {
    const info = extractProjections(node)

    const CTE = `WITH ${info.projections
      .filter(isCteClause)
      .map((c) => translateCte(c, context))
      .join(", ")}`

    return `${CTE} ${
      isTableQueryNode(info.queryNode)
        ? translateTableQuery(info.queryNode, context)
        : isJoinQueryNode(info.queryNode)
          ? translateJoinQuery(info.queryNode, context)
          : "error"
    }`
  } else {
    if (isTableQueryNode(node)) {
      return translateTableQuery(node, context)
    } else if (isJoinQueryNode(node)) {
      return translateJoinQuery(node, context)
    } else if (isInsertClause(node)) {
      return translateInsert(node, context)
    }
  }

  throw new QueryError("Unsupported type!")
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

function translateInsert(
  insert: InsertClause,
  context: PostgresContext,
): string {
  // Map the columns in order
  insert.columns.forEach((c: string) =>
    context.parameterMapping.set(c, context.parameterMapping.size + 1),
  )

  return `INSERT INTO ${insert.tableName}(${insert.columns.join(",")}) VALUES(${insert.columns.map((c: string) => `$${context.parameterMapping.get(c)!}`).join(",")})`
}

function translateCte(cte: CteClause, context: PostgresContext): string {
  return `${cte.tableName} AS (${
    isTableQueryNode(cte.source)
      ? translateTableQuery(cte.source, context)
      : isJoinQueryNode(cte.source)
        ? translateJoinQuery(cte.source, context)
        : "error"
  })`
}

function translateFilterGroup(
  filter: FilterGroup | FilterTypes,
  context: PostgresContext,
  table?: string,
): string {
  if (isFilterGroup(filter)) {
    return filter.filters
      .map((f) => translateFilterGroup(f, context, table))
      .join(` ${filter.op} `)
      .trimEnd()
  } else if (isColumnFilter(filter)) {
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
