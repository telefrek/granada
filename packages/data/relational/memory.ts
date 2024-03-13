/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type { RelationalDataStore, RelationalDataTable } from "."
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
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isRelationalQueryNode,
  isStringFilter,
  isTableQueryNode,
  type ArrayFilter,
  type ColumnFilter,
  type FilterGroup,
  type FilterTypes,
  type RelationalQueryNode,
  type StringFilter,
  type TableQueryNode,
} from "./ast"
import { RelationalQueryBuilder } from "./builder"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  type ArrayItemType,
  type ArrayProperty,
  type PropertiesOfType,
  type RelationalNodeType,
} from "./types"

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

type InMemoryQuerySourceMaterializer<
  DataStoreType extends RelationalDataStore,
  RowType
> = (store: InMemoryRelationalDataStore<DataStoreType>) => RowType[]

/**
 * Materialize a chunk of a query
 */
type InMemoryQuerySegmentMaterializer<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  T extends RelationalDataTable = DataStoreType["tables"][TargetTable]
> = (
  store: InMemoryRelationalDataStore<DataStoreType>,
  node: TableQueryNode<
    DataStoreType,
    TargetTable,
    DataStoreType["tables"][TargetTable]
  >,
  tempTables: Map<string, unknown[]>
) => T[]

class InMemoryQuery<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable
> implements Query<RowType>
{
  name: string
  mode: ExecutionMode
  source: InMemoryQuerySourceMaterializer<DataStoreType, RowType>

  constructor(
    name: string,
    source: InMemoryQuerySourceMaterializer<DataStoreType, RowType>,
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    this.name = name
    this.mode = mode
    this.source = source
  }
}

function isInMemoryQuery<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable
>(query: Query<RowType>): query is InMemoryQuery<DataStoreType, RowType> {
  return (
    typeof query === "object" &&
    query !== null &&
    "source" in query &&
    typeof query.source === "function"
  )
}

export class InMemoryQueryExecutor<DataStoreType extends RelationalDataStore>
  implements QueryExecutor<RelationalDataTable>
{
  store: InMemoryRelationalDataStore<DataStoreType>

  constructor(inMemoryStore?: InMemoryRelationalDataStore<DataStoreType>) {
    this.store = inMemoryStore ?? createInMemoryStore()
  }

  run<RowType>(
    query: Query<RowType>
  ): Promise<QueryResult<RowType> | StreamingQueryResult<RowType>> {
    if (isInMemoryQuery(query)) {
      const res = query.source(this.store)
      return Promise.resolve({
        rows: res as RowType[],
        duration: Duration.ZERO,
      } as QueryResult<RowType>)
    }

    throw new Error("Method not implemented.")
  }
}

function createMaterializer<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  T extends RelationalDataTable = DataStoreType["tables"][TargetTable]
>(
  table: TargetTable
): InMemoryQuerySegmentMaterializer<DataStoreType, TargetTable, T> {
  return (store, node, projections) => {
    let rows =
      node.tableName in store
        ? store[node.tableName]
        : (projections.get(
            node.tableName as string
          ) as DataStoreType["tables"][TargetTable][]) ?? []
    let ret: T[] = []

    // Check for any filters to apply
    if (node.where !== undefined) {
      rows = rows.filter(buildFilter(node.where.filter))
    }

    // Apply any select projections on the set firts
    if (node.select !== undefined) {
      ret = rows.map((r) => {
        const entries: Array<readonly [PropertyKey, any]> = []

        // TODO: handle aliasing
        const transform = new Map<string, string>()
        for (const alias of node.select?.aliasing ?? []) {
          transform.set(alias.column as string, alias.alias)
        }

        ;(node.select!.columns as string[]).map((c) =>
          entries.push([transform.has(c) ? transform.get(c)! : c, r[c]])
        )
        return Object.fromEntries(entries) as T
      })
    } else {
      ret = rows as T[]
    }

    return ret
  }
}

export class InMemoryRelationalQueryBuilder<
  RowType extends RelationalDataTable
> extends RelationalQueryBuilder<RowType> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }

  protected override buildQuery(node: QueryNode): Query<RowType> {
    // Verify we have a relational node
    if (isRelationalQueryNode(node) && isTableQueryNode(node)) {
      return new InMemoryQuery("name", (source) => {
        const projections: Map<string, unknown[]> = new Map()

        const materializer = this.unWrapProjections(source, node, projections)
        return materializer(source, node, projections)
      })
    }

    throw new QueryError("Node is not a RelationalQueryNode")
  }

  unWrapProjections<
    Store extends RelationalDataStore,
    TableName extends keyof Store["tables"]
  >(
    source: InMemoryRelationalDataStore<Store>,
    tableNode: TableQueryNode<Store, TableName>,
    projections: Map<string, unknown[]>
  ): InMemoryQuerySegmentMaterializer<Store, TableName> {
    // Check for a parent
    if (
      tableNode.parent !== undefined &&
      isRelationalQueryNode(tableNode.parent) &&
      isCteClause(tableNode.parent)
    ) {
      // Build the projection
      const cte = tableNode.parent

      const materializer = this.unWrapProjections(
        source,
        cte.source,
        projections
      )

      projections.set(
        cte.tableName,
        materializer(source, cte.source, projections)
      )
    }

    return createMaterializer(tableNode.tableName)
  }
}

function buildFilter<
  TableType extends Record<string, any> = Record<string, any>
>(
  clause: FilterGroup<TableType> | FilterTypes<TableType>
): (input: TableType) => boolean {
  if (isFilterGroup<TableType>(clause)) {
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
  } else if (IsArrayFilter(clause)) {
    return buildArrayFilter(clause)
  } else if (isStringFilter(clause)) {
    return buildStringFilter(clause)
  } else if (isColumnFilter(clause)) {
    return buildColumnFilter(clause)
  }

  return (_) => false
}

function buildArrayFilter<
  TableType extends Record<string, any> = Record<string, any>
>(
  columnFilter: ArrayFilter<
    TableType,
    ArrayProperty<TableType>,
    ArrayItemType<TableType, ArrayProperty<TableType>>
  >
): (input: TableType) => boolean {
  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column]

        if (Array.isArray(columnFilter.value)) {
          return columnFilter.value.some((val) => v.includes(val))
        }

        return v.includes(columnFilter.value)
      }
  }
}

function buildStringFilter<
  TableType extends Record<string, any> = Record<string, any>
>(
  columnFilter: StringFilter<TableType, PropertiesOfType<TableType, string>>
): (input: TableType) => boolean {
  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column]

        return v.indexOf(columnFilter.value as string) >= 0
      }
  }
}

function buildColumnFilter<
  TableType extends Record<string, any> = Record<string, any>
>(
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
