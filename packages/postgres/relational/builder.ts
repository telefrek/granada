/**
 * Implementation of the @telefrek/data packages
 */

import type {
  OptionalLiteralKeys,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils"
import { QueryError } from "@telefrek/data/query/error"
import {
  ExecutionMode,
  QueryType,
  type BoundQuery,
  type ParameterizedQuery,
  type QueryParameters,
  type RowType,
  type SimpleQuery,
} from "@telefrek/data/query/index"
import type { RelationalNodeType } from "@telefrek/data/relational/ast"
import {
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isJoinQueryNode,
  isParameterNode,
  isTableQueryNode,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinQueryNode,
  type RelationalQueryNode,
  type TableQueryNode,
} from "@telefrek/data/relational/ast"
import type {
  QueryBuilder,
  RelationalNodeBuilder,
  SupportedQueryTypes,
} from "@telefrek/data/relational/builder/index"
import { DefaultRelationalNodeBuilder } from "@telefrek/data/relational/builder/internal"
import {
  CteNodeManager,
  JoinNodeManager,
  TableNodeManager,
  getTreeRoot,
  hasProjections,
} from "@telefrek/data/relational/helpers"
import type {
  RelationalDataStore,
  RelationalDataTable,
} from "@telefrek/data/relational/index"
import type {
  PostgresColumnType,
  PostgresColumnTypes,
  PostgresDatabase,
  PostgresSchema,
} from ".."

export type PostgresTableRow<
  Schema extends PostgresSchema,
  L = RequiredLiteralKeys<Schema>,
  R = Required<Pick<Schema, keyof OptionalLiteralKeys<Schema>>>,
> = {
  [c in keyof L]: L[c] extends PostgresColumnTypes
    ? PostgresColumnType<L[c]>
    : c
} & Partial<{
  [c in keyof R]: R[c] extends PostgresColumnTypes
    ? PostgresColumnType<R[c]>
    : c
}>

export interface PostgresRelationalDataStore<
  Database extends PostgresDatabase,
> {
  tables: {
    [key in keyof Database["tables"]]: PostgresTableRow<
      Database["tables"][key]["schema"]
    >
  }
}

export function createRelationalQueryContext<
  Database extends PostgresDatabase,
>(): RelationalNodeBuilder<
  PostgresRelationalDataStore<Database>,
  QueryType.SIMPLE
> {
  return new DefaultRelationalNodeBuilder<
    PostgresRelationalDataStore<Database>,
    QueryType.SIMPLE
  >(QueryType.SIMPLE)
}

export function createParameterizedContext<
  Database extends PostgresDatabase,
  P extends QueryParameters,
>(): RelationalNodeBuilder<
  PostgresRelationalDataStore<Database>,
  QueryType.PARAMETERIZED,
  never,
  P
> {
  return new DefaultRelationalNodeBuilder<
    PostgresRelationalDataStore<Database>,
    QueryType.PARAMETERIZED,
    never,
    P
  >(QueryType.PARAMETERIZED)
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

type PostgresRelationalQuery<
  Q extends QueryType,
  R extends RowType,
  P extends QueryParameters,
> = [P] extends [never]
  ? SimplePostgresQuery<R>
  : Q extends QueryType.PARAMETERIZED
    ? ParametizedPostgresQuery<R, P>
    : Q extends QueryType.BOUND
      ? BoundPostgresQuery<R, P>
      : never

export function isPostgresQuery(query: unknown): query is PostgresQuery {
  return (
    typeof query === "object" &&
    query !== null &&
    "queryText" in query &&
    typeof query.queryText === "string"
  )
}

export function createPostgresQueryBuilder<
  Q extends SupportedQueryTypes,
  R extends RelationalDataTable,
  P extends QueryParameters,
>(): QueryBuilder<Q, R, P> {
  return (
    node: RelationalQueryNode<RelationalNodeType>,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> => {
    const context: PostgresContext = {
      parameterMapping: new Map(),
    }

    const queryText = translateNode(getTreeRoot(node), context)

    return {
      name,
      queryType,
      mode,
      queryText,
      context,
      bind:
        queryType === QueryType.PARAMETERIZED
          ? (p: P): BoundQuery<R, P> => {
              return {
                name,
                queryType: QueryType.BOUND,
                mode,
                queryText,
                parameters: p,
                context,
              } as BoundPostgresQuery<R, P>
            }
          : undefined,
    } as PostgresRelationalQuery<Q, R, P>
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
  node: RelationalQueryNode<RelationalNodeType>,
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
    }
  }

  return ""
}

interface ProjectionInfo {
  projections: RelationalQueryNode<RelationalNodeType>[]
  aliasing: Map<
    keyof RelationalDataStore["tables"],
    RelationalQueryNode<RelationalNodeType>
  >
  queryNode: RelationalQueryNode<RelationalNodeType>
}

function extractProjections(
  root: RelationalQueryNode<RelationalNodeType>,
): ProjectionInfo {
  const info: ProjectionInfo = {
    projections: [],
    queryNode: root,
    aliasing: new Map(),
  }

  let current: RelationalQueryNode<RelationalNodeType> | undefined = root
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
  filter: FilterGroup<RelationalDataTable> | FilterTypes<RelationalDataTable>,
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
