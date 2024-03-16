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
  isJoinColumnFilter,
  isJoinQueryNode,
  isRelationalQueryNode,
  isStringFilter,
  isTableAliasQueryNode,
  isTableQueryNode,
  type ArrayFilter,
  type ColumnFilter,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinQueryNode,
  type RelationalQueryNode,
  type RowGenerator,
  type StringFilter,
  type TableAliasQueryNode,
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
  type MergedNonOverlappingType,
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

/**
 * Materializes a projection
 */
type ProjectionMaterializer<DataStoreType extends RelationalDataStore> = (
  store: InMemoryRelationalDataStore<DataStoreType>,
  projections: Map<string, RelationalDataTable[]>
) => void

/**
 * Materialize a chunk of a query
 */
type InMemoryQuerySegmentMaterializer<
  DataStoreType extends RelationalDataStore,
  N extends RowGenerator<DataStoreType, RelationalDataTable>
> = (
  store: InMemoryRelationalDataStore<DataStoreType>,
  node: N,
  projections: Map<string, RelationalDataTable[]>
) => RelationalDataTable[]

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

/**
 * Find all of the nodes that are projections (virtual) that need to be created
 * prior to full execution of aggregates, joins, etc.
 *
 * @param node The starting point of the projection building
 * @returns A map with all the projections and their corrisponding table names
 */
function locateProjections(
  node: RelationalQueryNode<RelationalNodeType>
): Map<string, RelationalQueryNode<RelationalNodeType>> {
  const projections: Map<
    string,
    RelationalQueryNode<RelationalNodeType>
  > = new Map()

  // Just process each node until we run out
  const nodes: RelationalQueryNode<RelationalNodeType>[] = [node]
  while (nodes.length > 0) {
    const current = nodes.shift()!

    // If we alias anything we should resolve those first
    if (isCteClause(current)) {
      // Need to hydrate these
      projections.set(current.tableName, current)
      nodes.push(current.source)
    } else if (isTableQueryNode(current) && isTableAliasQueryNode(current)) {
      // Table aliasing is copy contents
      projections.set(current.tableAlias, current)
    } else if (isJoinQueryNode(current)) {
      // Joins themselves don't but may have clauses that do
      // Check for joins that have nested structure
      nodes.push(current.left)
      nodes.push(current.right)
    }

    // Search up the tree
    if (current.parent && isRelationalQueryNode(current.parent)) {
      nodes.push(current.parent)
    }

    // Search down the tree
    if (
      current.children &&
      current.children.some((c) => isRelationalQueryNode(c))
    ) {
      current.children
        .filter((c) => isRelationalQueryNode(c))
        .map((c) => nodes.push(c as RelationalQueryNode<RelationalNodeType>))
    }
  }

  return projections
}

function createJoinMaterializer<
  DataStoreType extends RelationalDataStore,
  LeftRowType extends RelationalDataTable,
  RightRowType extends RelationalDataTable
>(
  join: JoinQueryNode<DataStoreType, LeftRowType, RightRowType>
): InMemoryQuerySegmentMaterializer<
  DataStoreType,
  JoinQueryNode<DataStoreType, LeftRowType, RightRowType>
> {
  return (store, node, projections) => {
    const ret: Record<string, any>[] = []

    if (isJoinQueryNode(node)) {
      const left: ProjectedRow<RelationalDataTable>[] = []
      const right: ProjectedRow<RelationalDataTable>[] = []

      if (isTableQueryNode(node.left)) {
        left.push(
          ...createTableMaterializer(node.left.tableName)(
            store,
            node.left,
            projections
          ).filter(isProjectedRow)
        )
      } else if (isJoinQueryNode(node.left)) {
        left.push(
          ...createJoinMaterializer(node.left)(
            store,
            node.left,
            projections
          ).filter(isProjectedRow)
        )
      } else {
        left.push(
          ...(
            projections.get(node.left.tableName) ?? store[node.left.tableName]
          ).filter(isProjectedRow)
        )
      }

      if (isTableQueryNode(node.right)) {
        right.push(
          ...createTableMaterializer(node.right.tableName)(
            store,
            node.right,
            projections
          ).filter(isProjectedRow)
        )
      } else if (isJoinQueryNode(node.right)) {
        right.push(
          ...createJoinMaterializer(node.right)(
            store,
            node.right,
            projections
          ).filter(isProjectedRow)
        )
      } else {
        right.push(
          ...(
            projections.get(node.right.tableName) ?? store[node.right.tableName]
          ).filter(isProjectedRow)
        )
      }

      // Need to combine, do this in place at first but have to make generic
      // later

      if (
        isJoinColumnFilter(node.filter) &&
        node.filter.op === ColumnFilteringOperation.EQ
      ) {
        for (const leftRow of left) {
          for (const rightRow of right) {
            if (
              (leftRow[ORIGINAL] as any)[node.filter.leftColumn] ===
              (rightRow[ORIGINAL] as any)[node.filter.rightColumn]
            ) {
              ret.push({
                ...leftRow,
                ...rightRow,
              })
            }
          }
        }
      }
    }

    return ret.map(makeProjected) as MergedNonOverlappingType<
      LeftRowType,
      RightRowType
    >[]
  }
}

function createTableAliasMaterializer<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  TableAlias extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable
>(
  alias: TableAliasQueryNode<DataStoreType, TableName, TableAlias, RowType>
): ProjectionMaterializer<DataStoreType> {
  return (store, projections) => {
    if (isTableQueryNode(alias)) {
      const materializer = createTableMaterializer(alias.tableName)
      projections.set(
        alias.tableAlias as string,
        materializer(
          store,
          alias,
          projections as Map<string, RelationalDataTable[]>
        ).map(makeProjected)
      )
    }
  }
}

function createCteMaterializer<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  T extends RelationalDataTable = DataStoreType["tables"][TargetTable]
>(
  cte: CteClause<DataStoreType, TargetTable, T>
): ProjectionMaterializer<DataStoreType> {
  return (store, projections) => {
    // Get the source
    if (isTableQueryNode(cte.source)) {
      projections.set(
        cte.tableName as string,
        createTableMaterializer(cte.source.tableName)(
          store,
          cte.source,
          projections
        ).map(makeProjected)
      )
    } else if (isJoinQueryNode(cte.source)) {
      projections.set(
        cte.tableName as string,
        createJoinMaterializer(cte.source)(store, cte.source, projections).map(
          makeProjected
        )
      )
    }
  }
}

function createTableMaterializer<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"]
>(
  table: TableName
): InMemoryQuerySegmentMaterializer<
  DataStoreType,
  TableQueryNode<DataStoreType, TableName, RelationalDataStore>
> {
  return (store, node, projections) => {
    let ret: RelationalDataTable[] = []
    let rows =
      // Read any projections first to get rid of filtered rows before reading
      // raw table
      (projections.get(
        node.tableName as string
      ) as DataStoreType["tables"][TableName][]) ??
      (node.tableName in store ? store[node.tableName].map(makeProjected) : [])

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

        if (node.select!.columns === "*") {
          Object.keys(r).map((c) =>
            entries.push([transform.has(c) ? transform.get(c)! : c, r[c]])
          )
        } else {
          ;(node.select!.columns as string[]).map((c) =>
            entries.push([transform.has(c) ? transform.get(c)! : c, r[c]])
          )
        }

        // Copy any projection context
        if (isProjectedRow(r)) {
          entries.push([PROJECTED, true])
          entries.push([ORIGINAL, r[ORIGINAL]])
        }

        return Object.fromEntries(entries) as RelationalDataTable
      })
    }

    return ret
  }
}

// Internal symbols for tracking projected information
const PROJECTED: unique symbol = Symbol()
const ORIGINAL: unique symbol = Symbol()

// Need to a way to identified projected rows
type ProjectedRow<T> = RelationalDataTable & {
  [PROJECTED]: true
  [ORIGINAL]?: T
} & T

function isProjectedRow<T>(row: T): row is ProjectedRow<T> {
  return typeof row === "object" && row !== null && PROJECTED in row
}

function makeProjected<T>(row: T): ProjectedRow<T> {
  return isProjectedRow(row)
    ? row
    : {
        ...row,
        [PROJECTED]: true,
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
      return new InMemoryQuery("name", (store) => {
        const m: Map<string, RelationalDataTable[]> = new Map()

        const projections = locateProjections(node)
        if (projections.size > 0) {
          const targets = Array.from(projections.keys()).map(
            (key) => projections.get(key)!
          )

          // Handle table aliasing first...
          targets.map((t) => {
            if (isTableQueryNode(t) && isTableAliasQueryNode(t)) {
              createTableAliasMaterializer(t)(store, m)
            }
          })

          // Handle CTE in reverse order found (highest depth to lowest)
          targets.reverse().map((t) => {
            if (isCteClause(t)) {
              createCteMaterializer(t)(store, m)
            }
          })
        }

        if (isTableQueryNode(node)) {
          return createTableMaterializer(node.tableName)(store, node, m)
        } else if (isJoinQueryNode(node)) {
          return createJoinMaterializer(node)(store, node, m)
        }

        throw new QueryError("Invalid query type")
      })
    }

    throw new QueryError("Node is not a RelationalQueryNode")
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
