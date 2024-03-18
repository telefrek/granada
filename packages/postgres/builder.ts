/**
 * Implementation of the @telefrek/data packages
 */

import type { QueryNode } from "@telefrek/data/query/ast"
import { QueryError } from "@telefrek/data/query/error"
import { ExecutionMode, Query } from "@telefrek/data/query/index"
import {
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isJoinClauseNode,
  isRelationalQueryNode,
  isTableQueryNode,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type RelationalQueryNode,
  type TableQueryNode,
} from "@telefrek/data/relational/ast"
import {
  DefaultRelationalNodeBuilder,
  RelationalQueryBuilder,
  type RelationalNodeBuilder,
} from "@telefrek/data/relational/builder"
import {
  CteNodeManager,
  TableNodeManager,
  getTreeRoot,
  hasProjections,
} from "@telefrek/data/relational/helpers"
import type {
  RelationalDataStore,
  RelationalDataTable,
} from "@telefrek/data/relational/index"
import type { RelationalNodeType } from "@telefrek/data/relational/types"
import type {
  PostgresColumnType,
  PostgresColumnTypes,
  PostgresDatabase,
  PostgresTable,
} from "."

export type PostgresTableRow<Table extends PostgresTable> = {
  [column in keyof Table["schema"]]: Table["schema"][column] extends PostgresColumnTypes
    ? PostgresColumnType<Table["schema"][column]>
    : never
}

export type PostgresRelationalDataStore<Database extends PostgresDatabase> = {
  tables: {
    [key in keyof Database["tables"]]: PostgresTableRow<Database["tables"][key]>
  }
}

export function createRelationalQueryContext<
  Database extends PostgresDatabase
>(): RelationalNodeBuilder<PostgresRelationalDataStore<Database>> {
  return new DefaultRelationalNodeBuilder<
    PostgresRelationalDataStore<Database>
  >()
}

export class PostgresRelationalQuery<RowType> implements Query<RowType> {
  readonly name: string
  readonly mode: ExecutionMode
  readonly queryText: string

  constructor(
    name: string,
    queryText: string,
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    this.name = name
    this.mode = mode
    this.queryText = queryText
  }
}

export function isPostgresRelationalQuery<RowType>(
  query: Query<RowType>
): query is PostgresRelationalQuery<RowType> {
  return "queryText" in query && typeof query.queryText === "string"
}

export class ParameterizedPostgresRelationalQuery<
  ParameterType,
  RowType
> extends PostgresRelationalQuery<RowType> {
  constructor(
    name: string,
    queryText: string,
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    super(name, queryText, mode)
  }
}

export class BoundPostgresRelationalQuery<
  RowType
> extends PostgresRelationalQuery<RowType> {
  readonly parameters: readonly PostgresColumnType<PostgresColumnTypes>[]

  constructor(
    name: string,
    queryText: string,
    parameters: readonly PostgresColumnType<PostgresColumnTypes>[],
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    super(name, queryText, mode)
    this.parameters = parameters
  }
}

export class PostgresQueryBuilder<
  RowType extends RelationalDataTable
> extends RelationalQueryBuilder<RowType> {
  protected override buildQuery<T>(ast: QueryNode): Query<T> {
    if (isRelationalQueryNode(ast)) {
      return new PostgresRelationalQuery("foo", translateNode(getTreeRoot(ast)))
    }

    throw new QueryError("Invalid QueryNode, expected RelationalQueryNode.")
  }
}

function translateTableQuery(
  node: TableQueryNode<RelationalDataStore, keyof RelationalDataStore["tables"]>
): string {
  const manager = new TableNodeManager(node)

  const select = manager.select

  const aliasing: Map<string, string> = manager.columnAlias
    ? manager.columnAlias.reduce(
        (temp, alias) => temp.set(alias.column as string, alias.alias),
        new Map<string, string>()
      )
    : new Map()

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

    let CTE = `WITH ${info.projections
      .filter(isCteClause)
      .map(translateCte)
      .join(",")}`

    return `${CTE} ${
      isTableQueryNode(info.queryNode)
        ? translateTableQuery(info.queryNode)
        : ""
    }`
  } else {
    if (isTableQueryNode(node)) {
      return translateTableQuery(node)
    }
  }

  return ""
}

type ProjectionInfo = {
  projections: RelationalQueryNode<RelationalNodeType>[]
  aliasing: Map<
    keyof RelationalDataStore["tables"],
    RelationalQueryNode<RelationalNodeType>
  >
  queryNode: RelationalQueryNode<RelationalNodeType>
}

function extractProjections(
  root: RelationalQueryNode<RelationalNodeType>
): ProjectionInfo {
  const info: ProjectionInfo = {
    projections: [],
    queryNode: root,
    aliasing: new Map(),
  }

  let current: RelationalQueryNode<RelationalNodeType> | undefined = root
  while (current) {
    // Terminal cases
    if (isTableQueryNode(current) || isJoinClauseNode(current)) {
      info.queryNode = current
      break
    }

    if (isCteClause(current)) {
      info.projections.push(current)
      current = new CteNodeManager(current).child
    }
  }

  return info
}

function translateCte(
  cte: CteClause<
    RelationalDataStore,
    keyof RelationalDataStore["tables"],
    RelationalDataTable
  >
): string {
  return `${cte.tableName} AS (${
    isTableQueryNode(cte.source) ? translateTableQuery(cte.source) : ""
  })`
}

function translateFilterGroup(
  filter: FilterGroup<RelationalDataTable> | FilterTypes<RelationalDataTable>
): string {
  if (isFilterGroup(filter)) {
    return filter.filters
      .map((f) => translateFilterGroup(f))
      .join(` ${filter.op} `)
      .trimEnd()
  } else if (isColumnFilter(filter)) {
    return `${filter.column as string} ${filter.op} ${wrap(filter.value)}`
  } else if (IsArrayFilter(filter)) {
    return `${wrap(filter.value)}=ANY(${filter.column as string})`
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
