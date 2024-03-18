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
  isGenerator,
  isJoinClauseNode,
  isJoinColumnFilter,
  isJoinQueryNode,
  isRelationalQueryNode,
  isSelectClause,
  isStringFilter,
  isTableAliasQueryNode,
  isTableQueryNode,
  isWhereClause,
  type ArrayFilter,
  type ColumnFilter,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinQueryNode,
  type RelationalQueryNode,
  type StringFilter,
  type TableAliasNode,
  type TableQueryNode,
} from "./ast"
import { RelationalQueryBuilder } from "./builder"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
  type PropertiesOfType,
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

type InMemoryQuerySourceMaterializer<
  DataStoreType extends RelationalDataStore,
  RowType
> = (store: InMemoryRelationalDataStore<DataStoreType>) => RowType[]

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

// Internal symbols for tracking projected information
const ORIGINAL: unique symbol = Symbol()

// Need to a way to identified original row sources for joins
type RowPointer<T> = RelationalDataTable & {
  [ORIGINAL]?: T
} & T

function isRowPointer<T>(row: T): row is RowPointer<T> {
  return typeof row === "object" && row !== null && ORIGINAL in row
}

function makePointer<T>(row: T): RowPointer<T> {
  return isRowPointer(row)
    ? row
    : {
        ...row,
        [ORIGINAL]: row,
      }
}

/**
 * Translates queries into a set of functions on top of an in memory set of tables
 *
 * NOTE: Seriously, don't use this for anything but
 * testing...it's....sloooooowwwwww (and quite probably wrong)
 */
export class InMemoryRelationalQueryBuilder<
  RowType extends RelationalDataTable
> extends RelationalQueryBuilder<RowType> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }

  protected override buildQuery(node: QueryNode): Query<RowType> {
    // Verify we have a relational node
    if (isRelationalQueryNode(node) && isGenerator(node)) {
      // Go up to the root
      let root = node
      let limit = 100
      while (root.parent !== undefined && isRelationalQueryNode(root.parent)) {
        root = root.parent
        if (--limit == 0) {
          throw new QueryError("boom")
        }
      }

      return new InMemoryQuery("name", (store) => {
        return materializeNode<RowType>(root, store)
      })
    }

    throw new QueryError("Node is not a RelationalQueryNode")
  }
}

type Projections = Map<
  keyof RelationalDataStore["tables"],
  RelationalDataTable[]
>

function materializeTable(
  table: TableQueryNode<
    RelationalDataStore,
    keyof RelationalDataStore["tables"]
  >,
  projections: Projections,
  store: InMemoryRelationalDataStore<RelationalDataStore>
): RelationalDataTable[] {
  let ret: RelationalDataTable[] = []
  let rows =
    // Read any projections first to get rid of filtered rows before reading
    // raw table
    projections.get(table.tableName) ??
    (table.tableName in store ? store[table.tableName].map(makePointer) : [])

  let where = table.children?.filter(isWhereClause).at(0)
  let select = table.children?.filter(isSelectClause).at(0)

  // Check for any filters to apply
  if (where !== undefined) {
    rows = rows.filter(buildFilter(where.filter))
  }

  // Apply any select projections on the set firts
  if (select !== undefined) {
    ret = rows.map((r) => {
      const entries: Array<readonly [PropertyKey, any]> = []

      const transform = new Map<string, string>()
      for (const alias of select!.aliasing ?? []) {
        transform.set(alias.column as string, alias.alias)
      }

      if (select!.columns === "*") {
        Object.keys(r).map((c) =>
          entries.push([transform.has(c) ? transform.get(c)! : c, r[c]])
        )
      } else {
        ;(select!.columns as string[]).map((c) =>
          entries.push([transform.has(c) ? transform.get(c)! : c, r[c]])
        )
      }

      // Carry any pointer context
      if (isRowPointer(r)) {
        entries.push([ORIGINAL, r[ORIGINAL]])
      }

      return Object.fromEntries(entries) as RelationalDataTable
    })
  }

  return ret
}

function materializeJoin(
  join: JoinQueryNode<
    RelationalDataStore,
    keyof RelationalDataStore["tables"],
    RelationalDataTable
  >,
  projections: Projections,
  store: InMemoryRelationalDataStore<RelationalDataStore>
): RelationalDataTable[] {
  let rows: RelationalDataTable[] = []

  // Need to find all the table nodes and map them to data
  const tables: Map<
    keyof RelationalDataStore["tables"],
    RowPointer<RelationalDataTable>[]
  > = new Map()
  for (const table of join.children?.filter(isTableQueryNode) ?? []) {
    tables.set(
      table.tableName,
      materializeTable(table, projections, store).filter(isRowPointer)
    )
  }

  // Apply all the filtering sets...
  for (const filter of join.children?.filter(isJoinClauseNode) ?? []) {
    const left = tables.get(filter.left)!
    const right = tables.get(filter.right)!

    if (isJoinColumnFilter(filter.filter)) {
      const f = filter.filter
      tables.set(
        filter.left,
        left.filter((l) =>
          right.some(
            (r) =>
              (l as any)[ORIGINAL][f.leftColumn] ===
              (r as any)[ORIGINAL][f.rightColumn]
          )
        )
      )
      tables.set(
        filter.right,
        right.filter((r) =>
          left.some(
            (l) =>
              (l as any)[ORIGINAL][f.leftColumn] ===
              (r as any)[ORIGINAL][f.rightColumn]
          )
        )
      )
    }
  }

  // Build all the rows...
  for (const filter of join.children?.filter(isJoinClauseNode) ?? []) {
    const left = tables.get(filter.left)!
    const right = tables.get(filter.right)!

    if (isJoinColumnFilter(filter.filter)) {
      const f = filter.filter

      const current = [...rows]
      rows = []
      for (const l of left) {
        for (const r of right.filter(
          (r) =>
            (l as any)[ORIGINAL][f.leftColumn] ===
            (r as any)[ORIGINAL][f.rightColumn]
        )) {
          // Spread the values
          const m: RelationalDataTable = { ...l, ...r }
          if (current.length > 0) {
            for (const c of current) {
              rows.push({ ...c, ...m })
            }
          } else {
            rows.push(m)
          }
        }
      }
    }
  }

  return rows
}

function materializeCte(
  cte: CteClause<
    RelationalDataStore,
    keyof RelationalDataStore["tables"],
    RelationalDataTable
  >,
  projections: Projections,
  store: InMemoryRelationalDataStore<RelationalDataStore>
): RelationalQueryNode<RelationalNodeType> | undefined {
  if (isRelationalQueryNode(cte.source)) {
    switch (true) {
      case isTableQueryNode(cte.source):
        projections.set(
          cte.tableName,
          materializeTable(cte.source, projections, store)
        )
        break
      case isJoinQueryNode(cte.source):
        projections.set(
          cte.tableName,
          materializeJoin(cte.source, projections, store)
        )
    }

    if (cte.children) {
      return cte.children
        .filter(isRelationalQueryNode)
        .filter((r) => r !== cte.source) // Filter select and where
        .at(0)
    }
  }

  return
}

function materializeAlias(
  cte: TableAliasNode<
    RelationalDataStore,
    keyof RelationalDataStore["tables"],
    RelationalDataTable
  >,
  projections: Projections,
  store: InMemoryRelationalDataStore<RelationalDataStore>
): RelationalQueryNode<RelationalNodeType> | undefined {
  if (cte.children) {
    const child = cte.children.filter(isRelationalQueryNode).at(0)!
    if (isRelationalQueryNode(child)) {
      switch (true) {
        case isTableQueryNode(child):
          projections.set(
            cte.tableName,
            materializeTable(child, projections, store)
          )
          break
      }
    }

    if (child.children) {
      return child.children
        .filter(isRelationalQueryNode)
        .filter((r) => !isWhereClause(r) && !isSelectClause(r)) // Filter select and where
        .at(0)
    }
  }

  return
}

function materializeNode<RowType extends RelationalDataTable>(
  root: RelationalQueryNode<RelationalNodeType>,
  store: InMemoryRelationalDataStore<RelationalDataStore>
): RowType[] {
  const projections: Projections = new Map()

  let current: RelationalQueryNode<RelationalNodeType> | undefined = root
  while (
    current != undefined &&
    !isTableQueryNode(current) &&
    !isJoinQueryNode(current) &&
    current.children
  ) {
    if (isCteClause(current)) {
      current = materializeCte(current, projections, store)
    } else if (isTableAliasQueryNode(current)) {
      current = materializeAlias(current, projections, store)
    } else {
      throw new QueryError("never ending...")
    }
  }

  if (current !== undefined) {
    if (isTableQueryNode(current)) {
      return materializeTable(current, projections, store) as RowType[]
    } else if (isJoinQueryNode(current)) {
      return materializeJoin(current, projections, store) as RowType[]
    }
  }

  return []
}

function buildFilter(
  clause: FilterGroup<RelationalDataTable> | FilterTypes<RelationalDataTable>
): (input: RelationalDataTable) => boolean {
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
  } else if (IsArrayFilter(clause)) {
    return buildArrayFilter(clause)
  } else if (isStringFilter(clause)) {
    return buildStringFilter(clause)
  } else if (isColumnFilter(clause)) {
    return buildColumnFilter(clause)
  }

  return (_) => false
}

function buildArrayFilter(
  columnFilter: ArrayFilter<
    RelationalDataTable,
    ArrayProperty<RelationalDataTable>,
    ArrayItemType<RelationalDataTable, ArrayProperty<RelationalDataTable>>
  >
): (input: RelationalDataTable) => boolean {
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

function buildStringFilter(
  columnFilter: StringFilter<
    RelationalDataTable,
    PropertiesOfType<RelationalDataTable, string>
  >
): (input: RelationalDataTable) => boolean {
  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column]

        return v.indexOf(columnFilter.value as string) >= 0
      }
  }
}

function buildColumnFilter(
  columnFilter: ColumnFilter<RelationalDataTable, keyof RelationalDataTable>
): (input: RelationalDataTable) => boolean {
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
