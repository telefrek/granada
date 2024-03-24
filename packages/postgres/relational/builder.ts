/**
 * Implementation of the @telefrek/data packages
 */

import { getDebugInfo } from "@telefrek/core"
import { QueryError } from "@telefrek/data/query/error"
import {
  ExecutionMode,
  QueryType,
  type Query,
  type QueryParameters,
} from "@telefrek/data/query/index"
import type { RelationalNodeType } from "@telefrek/data/relational/ast"
import {
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isJoinQueryNode,
  isRelationalQueryNode,
  isTableQueryNode,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinQueryNode,
  type RelationalQueryNode,
  type TableQueryNode,
} from "@telefrek/data/relational/ast"
import type { RelationalNodeBuilder } from "@telefrek/data/relational/builder/index.js"
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
  PostgresTable,
} from ".."

export type PostgresTableRow<Table extends PostgresTable> = {
  [column in keyof Table["schema"]]: Table["schema"][column] extends PostgresColumnTypes
    ? PostgresColumnType<Table["schema"][column]>
    : never
}

export interface PostgresRelationalDataStore<
  Database extends PostgresDatabase,
> {
  tables: {
    [key in keyof Database["tables"]]: PostgresTableRow<Database["tables"][key]>
  }
}

export function createRelationalQueryContext<
  Database extends PostgresDatabase,
>(): RelationalNodeBuilder<
  PostgresRelationalDataStore<Database>,
  QueryType.RAW
> {
  return new DefaultRelationalNodeBuilder<
    PostgresRelationalDataStore<Database>,
    QueryType.RAW
  >(QueryType.RAW)
}

export class PostgresRelationalQuery<
  RowType extends object,
  Q extends QueryType,
> implements Query<Q, RowType, never>
{
  readonly name: string
  readonly mode: ExecutionMode
  queryType: Q
  readonly queryText: string

  constructor(name: string, queryText: string, mode: ExecutionMode, type: Q) {
    this.name = name
    this.mode = mode
    this.queryText = queryText
    this.queryType = type
  }
}

export function isPostgresRelationalQuery<RowType extends object>(
  query: Query<QueryType, RowType, never>,
): query is PostgresRelationalQuery<RowType, QueryType> {
  return "queryText" in query && typeof query.queryText === "string"
}

export const PostgresQueryBuilder = <
  _D extends RelationalDataStore,
  Q extends QueryType,
  R extends RelationalDataTable,
  P extends QueryParameters = never,
>(
  ast: RelationalQueryNode<RelationalNodeType>,
  q: Q,
  name: string,
  mode: ExecutionMode = ExecutionMode.Normal,
): Query<Q, R, P> => {
  if (isRelationalQueryNode(ast)) {
    return new PostgresRelationalQuery<R, Q>(
      name,
      translateNode(getTreeRoot(ast)),
      mode,
      q,
    )
  }

  throw new QueryError("Invalid node type")
}

function translateJoinQuery(node: JoinQueryNode): string {
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
        return translateFilterGroup(where.filter, tm.tableName)
      }

      return ""
    })
    .filter((s) => s.length > 0)
    .join(", ")

  return `SELECT ${select} FROM ${from}${where ? ` WHERE ${where}` : ""}`
}

function translateTableQuery(node: TableQueryNode): string {
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
    manager.where ? ` WHERE ${translateFilterGroup(manager.where.filter)}` : ""
  }`
}

function translateNode(node: RelationalQueryNode<RelationalNodeType>): string {
  if (hasProjections(node)) {
    const info = extractProjections(node)

    const CTE = `WITH ${info.projections
      .filter(isCteClause)
      .map(translateCte)
      .join(", ")}`

    return `${CTE} ${
      isTableQueryNode(info.queryNode)
        ? translateTableQuery(info.queryNode)
        : isJoinQueryNode(info.queryNode)
          ? translateJoinQuery(info.queryNode)
          : "error"
    }`
  } else {
    if (isTableQueryNode(node)) {
      return translateTableQuery(node)
    } else if (isJoinQueryNode(node)) {
      return translateJoinQuery(node)
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

function translateCte(cte: CteClause): string {
  return `${cte.tableName} AS (${
    isTableQueryNode(cte.source)
      ? translateTableQuery(cte.source)
      : isJoinQueryNode(cte.source)
        ? translateJoinQuery(cte.source)
        : "error"
  })`
}

function translateFilterGroup(
  filter: FilterGroup<RelationalDataTable> | FilterTypes<RelationalDataTable>,
  table?: string,
): string {
  if (isFilterGroup(filter)) {
    return filter.filters
      .map((f) => translateFilterGroup(f, table))
      .join(` ${filter.op} `)
      .trimEnd()
  } else if (isColumnFilter(filter)) {
    return `${table ? `${table}.` : ""}${filter.column} ${
      filter.op
    } ${wrap(filter.value)}`
  } else if (IsArrayFilter(filter)) {
    console.log(getDebugInfo(filter))
    return `${wrap(filter.value)}=ANY(${table ? `${table}.` : ""}${
      filter.column
    })`
  }

  throw new QueryError("Unsupported query filter type")
}

function wrap(value: unknown): string {
  return typeof value === "string"
    ? `'${value}'`
    : value === "object"
      ? value === null
        ? "null"
        : Array.isArray(value)
          ? `{${value.map((i) => wrap(i)).join(",")}}`
          : `'${JSON.stringify(value)}'`
      : (value as string)
}
