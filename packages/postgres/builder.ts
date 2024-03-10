/**
 * Implementation of the @telefrek/data packages
 */

import type { QueryNode } from "@telefrek/data/query/ast"
import { QueryError } from "@telefrek/data/query/error"
import { ExecutionMode, Query } from "@telefrek/data/query/index"
import {
  isColumnFilter,
  isContainmentFilter,
  isFilterGroup,
  isRelationalQueryNode,
  isTableQueryNode,
  type FilterGroup,
  type FilterTypes,
  type TableQueryNode,
} from "@telefrek/data/relational/ast"
import {
  DefaultRelationalNodeBuilder,
  RelationalQueryBuilder,
  type RelationalNodeBuilder,
} from "@telefrek/data/relational/builder"
import type {
  RelationalDataStore,
  RelationalDataTable,
} from "@telefrek/data/relational/index"
import type {
  PostgresColumnType,
  PostgresColumnTypeDebug,
  PostgresColumnTypes,
  PostgresDatabase,
  PostgresTable,
} from "."

export type PostgresTableRow<Table extends PostgresTable> = {
  [column in keyof Table["schema"]]: PostgresColumnTypeDebug<
    Table["schema"][column]
  >
}

export type PostgresRelationalDataStore<Database extends PostgresDatabase> = {
  tables: {
    [key in keyof Database["tables"]]: PostgresTableRow<Database["tables"][key]>
  }
}

export function createRelationalQueryContext<
  Database extends PostgresDatabase
>(): RelationalNodeBuilder<PostgresRelationalDataStore<Database>> {
  return new DefaultRelationalNodeBuilder()
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
    if (isRelationalQueryNode(ast) && isTableQueryNode(ast)) {
      return new PostgresRelationalQuery("foo", translateTableQuery(ast))
    }

    throw new QueryError("Invalid QueryNode, expected RelationalQueryNode.")
  }
}

function translateTableQuery(
  tableQueryNode: TableQueryNode<
    RelationalDataStore,
    keyof RelationalDataStore["tables"]
  >
): string {
  const aliasing: Map<string, string> = tableQueryNode.select?.aliasing
    ? tableQueryNode.select.aliasing.reduce(
        (temp, alias) => temp.set(alias.column as string, alias.alias),
        new Map<string, string>()
      )
    : new Map()

  return `SELECT ${
    tableQueryNode.select
      ? tableQueryNode.select.columns
          .map((c) => (aliasing.has(c) ? `${c} as ${aliasing.get(c)!}` : c))
          .join(", ")
      : "*"
  } FROM ${tableQueryNode.tableName} ${
    tableQueryNode.where
      ? `WHERE ${translateFilterGroup(tableQueryNode.where.filter)}`
      : ""
  }`
}

function translateFilterGroup<RelationalDataTable>(
  filter: FilterGroup<RelationalDataTable> | FilterTypes<RelationalDataTable>
): string {
  if (isFilterGroup(filter)) {
    return filter.filters
      .map((f) => translateFilterGroup(f))
      .join(` ${filter.op} `)
      .trimEnd()
  } else if (isColumnFilter(filter)) {
    return `${filter.column as string} ${filter.op} ${wrap(filter.value)}`
  } else if (isContainmentFilter(filter)) {
    return `${wrap(filter.value)}=ANY(${filter.column as string})`
  }

  throw new QueryError("Unsupported query filter type")
}

function wrap<T>(value: T): string {
  return typeof value === "string"
    ? `'${value}'`
    : value === "object"
    ? value === null
      ? "null"
      : Array.isArray(value)
      ? `{${value.map((i) => wrap(i))}}`
      : `'${JSON.stringify(value)}'`
    : (value as string)
}
