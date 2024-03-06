/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type { RelationalDataStore } from "."
import {
  ExecutionMode,
  Query,
  type QueryExecutor,
  type QueryResult,
  type StreamingQueryResult,
} from "../query"
import type { QueryNode } from "../query/ast"
import { QueryError } from "../query/error"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  isColumnFilter,
  isContainmentFilter,
  isFilterGroup,
  isRelationalQueryNode,
  isTableQueryNode,
  type ColumnFilter,
  type ContainmentFilter,
  type ContainmentItemType,
  type ContainmentProperty,
  type FilterGroup,
  type FilterTypes,
  type RelationalQueryNode,
} from "./ast"
import { RelationalQueryBuilder } from "./builder"

/**
 * Define an in memory table as an array of the given {@link TableType}
 */
export type InMemoryTable<TableType> = TableType[]

/**
 * Define an in memory {@link RelationalDataStore} as a collection of table
 * name, {@link InMemoryTable} for the given type
 */
export type InMemoryRelationalDataStore<
  DataStoreType extends RelationalDataStore
> = {
  [key in keyof DataStoreType["tables"]]: InMemoryTable<
    DataStoreType["tables"][key]
  >
}
export function createInMemoryStore<
  DataStoreType extends RelationalDataStore
>(): InMemoryRelationalDataStore<DataStoreType> {
  return {
    sources: {},
  } as InMemoryRelationalDataStore<DataStoreType>
}

type InMemoryQuerySourceFn<
  DataStoreType extends RelationalDataStore,
  RowType
> = (store: InMemoryRelationalDataStore<DataStoreType>) => RowType[]

class InMemoryQuery<DataStoreType extends RelationalDataStore, RowType>
  implements Query<RowType>
{
  name: string
  mode: ExecutionMode
  s: InMemoryQuerySourceFn<DataStoreType, RowType>

  constructor(
    name: string,
    s: InMemoryQuerySourceFn<DataStoreType, RowType>,
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    this.name = name
    this.mode = mode
    this.s = s
  }
}

function isInMemoryQuery<DataStoreType extends RelationalDataStore, RowType>(
  query: Query<RowType>
): query is InMemoryQuery<DataStoreType, RowType> {
  return (
    typeof query === "object" &&
    query !== null &&
    "s" in query &&
    typeof query.s === "function"
  )
}

export class InMemoryQueryExecutor<DataStoreType extends RelationalDataStore>
  implements QueryExecutor
{
  store: InMemoryRelationalDataStore<DataStoreType>

  constructor(inMemoryStore?: InMemoryRelationalDataStore<DataStoreType>) {
    this.store = inMemoryStore ?? createInMemoryStore()
  }

  run<RowType>(
    query: Query<RowType>
  ): Promise<QueryResult<RowType> | StreamingQueryResult<RowType>> {
    if (isInMemoryQuery(query)) {
      const res = query.s(this.store)
      return Promise.resolve({
        rows: res as RowType[],
        duration: Duration.ZERO,
      } as QueryResult<RowType>)
    }

    throw new Error("Method not implemented.")
  }
}

export class InMemoryRelationalQueryBuilder<
  DataStoreType extends RelationalDataStore,
  RowType
> extends RelationalQueryBuilder<RowType> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }

  protected override buildQuery<T>(ast: QueryNode): Query<T> {
    // Verify we have a relational node
    if (isRelationalQueryNode(ast) && isTableQueryNode(ast)) {
      return new InMemoryQuery<DataStoreType, T>("name", (source) => {
        let rows = source[ast.table] ?? []
        let ret: T[] = []

        // Check for any filters to apply
        if (ast.where !== undefined) {
          rows = rows.filter(buildFilter(ast.where.filter))
        }

        // Apply any select projections on the set firts
        if (ast.select !== undefined) {
          ret = rows.map((r) => {
            const entries: Array<readonly [PropertyKey, any]> = []

            // TODO: handle aliasing
            const transform = new Map<string, string>()
            for (const alias of ast.select?.alias ?? []) {
              transform.set(alias.column, alias.alias)
            }

            ast.select!.columns.map((c) =>
              entries.push([transform.has(c) ? transform.get(c)! : c, r[c]])
            )
            return Object.fromEntries(entries) as T
          })
        } else {
          ret = rows as T[]
        }

        return ret
      })
    }

    throw new QueryError("Node is not a RelationalQueryNode")
  }
}

function buildFilter<TableType>(
  clause: FilterGroup<TableType> | FilterTypes<TableType>
): (input: TableType) => boolean {
  if (isFilterGroup(clause)) {
    const filters = clause.filters.map((f) => buildFilter(f))
    switch (clause.op) {
      case BooleanOperation.AND:
        return (row) => {
          for (const filter of filters) {
            if (!filter(row)) return false
          }
          return true
        }
      case BooleanOperation.OR:
        return (row) => filters.some((f) => f(row))
      case BooleanOperation.NOT:
        return (row) => !filters.some((f) => f(row))
    }
  } else if (isContainmentFilter(clause)) {
    return buildContainsFilter(clause)
  } else if (isColumnFilter(clause)) {
    return buildColumnFilter(clause)
  }

  return (_) => false
}

function buildContainsFilter<TableType>(
  columnFilter: ContainmentFilter<
    TableType,
    ContainmentProperty<TableType>,
    ContainmentItemType<TableType, ContainmentProperty<TableType>>
  >
): (input: TableType) => boolean {
  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column]

        if (typeof v === "string") {
          return v.indexOf(columnFilter.value as string) >= 0
        } else if (Array.isArray(v)) {
          return v.includes(columnFilter.value)
        }

        return false
      }
  }
}

function buildColumnFilter<TableType>(
  columnFilter: ColumnFilter<TableType, keyof TableType>
): (input: TableType) => boolean {
  switch (columnFilter.op) {
    case ColumnFilteringOperation.EQ:
      return (row) => row[columnFilter.column] === columnFilter.value
    case ColumnFilteringOperation.GT:
      return (row) => row[columnFilter.column] > columnFilter.value
    case ColumnFilteringOperation.GTE:
      return (row) => row[columnFilter.column] >= columnFilter.value
    case ColumnFilteringOperation.LT:
      return (row) => row[columnFilter.column] < columnFilter.value
    case ColumnFilteringOperation.LTE:
      return (row) => row[columnFilter.column] <= columnFilter.value
  }
}
