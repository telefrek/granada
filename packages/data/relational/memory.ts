/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type {
  QueryParameters,
  RelationalDataStore,
  RelationalDataTable,
} from "."
import {
  ExecutionMode,
  Query,
  isParameterizedQuery,
  type ParameterizedQuery,
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
  isJoinQueryNode,
  isParameterNode,
  isRelationalQueryNode,
  isStringFilter,
  isTableQueryNode,
  type ArrayFilter,
  type ColumnFilter,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinColumnFilter,
  type JoinQueryNode,
  type RelationalQueryNode,
  type StringFilter,
  type TableQueryNode,
} from "./ast"
import {
  ParameterizedRelationalQueryBuilder,
  RelationalQueryBuilder,
} from "./builder"
import {
  JoinNodeManager,
  TableNodeManager,
  getTreeRoot,
  hasProjections,
} from "./helpers"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
  type PropertyOfType,
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
  DataStoreType extends RelationalDataStore,
> = {
  [key in keyof DataStoreType["tables"]]: InMemoryTable<
    DataStoreType["tables"][key]
  >
}
export function createInMemoryStore<
  DataStoreType extends RelationalDataStore,
>(): InMemoryRelationalDataStore<DataStoreType> {
  return {
    sources: {},
  } as InMemoryRelationalDataStore<DataStoreType>
}

export class InMemoryQueryExecutor<DataStoreType extends RelationalDataStore>
  implements QueryExecutor
{
  store: InMemoryRelationalDataStore<DataStoreType>

  constructor(inMemoryStore?: InMemoryRelationalDataStore<DataStoreType>) {
    this.store = inMemoryStore ?? createInMemoryStore()
  }

  run<RowType extends object>(
    query: Query<RowType>,
  ): Promise<QueryResult<RowType> | StreamingQueryResult<RowType>> {
    if (isInMemoryQuery(query)) {
      if (
        isParameterizedQuery(query) &&
        "parameters" in query &&
        typeof query.parameters === "object" &&
        query.parameters !== null
      ) {
        const res = query.source(this.store, query.parameters)
        return Promise.resolve({
          rows: res,
          duration: Duration.ZERO,
        } as QueryResult<RowType>)
      } else if (isParameterizedQuery(query)) {
        return Promise.reject(
          new QueryError(
            "Cannot execute Parameterized query that is not bound!",
          ),
        )
      }
      const res = query.source(this.store, query)
      return Promise.resolve({
        rows: res,
        duration: Duration.ZERO,
      } as QueryResult<RowType>)
    }

    throw new Error("Method not implemented.")
  }
}

type InMemoryQuerySourceMaterializer<
  DataStoreType extends RelationalDataStore,
  RowType,
> = (
  store: InMemoryRelationalDataStore<DataStoreType>,
  parameters?: QueryParameters,
) => RowType[]

class InMemoryQuery<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable,
> implements Query<RowType>
{
  name: string
  mode: ExecutionMode
  source: InMemoryQuerySourceMaterializer<DataStoreType, RowType>

  constructor(
    name: string,
    source: InMemoryQuerySourceMaterializer<DataStoreType, RowType>,
    mode: ExecutionMode = ExecutionMode.Normal,
  ) {
    this.name = name
    this.mode = mode
    this.source = source
  }
}

class ParameterizedInMemoryQuery<
    DataStoreType extends RelationalDataStore,
    RowType extends RelationalDataTable,
    ParameterType extends QueryParameters,
  >
  extends InMemoryQuery<DataStoreType, RowType>
  implements ParameterizedQuery<RowType, ParameterType>
{
  parameters?: ParameterType

  constructor(
    name: string,
    source: InMemoryQuerySourceMaterializer<DataStoreType, RowType>,
    mode: ExecutionMode = ExecutionMode.Normal,
  ) {
    super(name, source, mode)
  }

  bind(parameters: ParameterType): Query<RowType> {
    this.parameters = parameters
    return this
  }
}

function isInMemoryQuery<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable,
>(query: Query<RowType>): query is InMemoryQuery<DataStoreType, RowType> {
  return (
    typeof query === "object" &&
    query !== null &&
    "source" in query &&
    typeof query.source === "function"
  )
}
/**
 * Translates queries into a set of functions on top of an in memory set of tables
 *
 * NOTE: Seriously, don't use this for anything but
 * testing...it's....sloooooowwwwww (and quite probably wrong)
 */
export class InMemoryRelationalQueryBuilder<
  RowType extends RelationalDataTable,
> extends RelationalQueryBuilder<RowType> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }

  protected override buildQuery(
    node: QueryNode,
    name: string,
    mode: ExecutionMode,
  ): Query<RowType> {
    // Verify we have a relational node
    if (isRelationalQueryNode(node) && isGenerator(node)) {
      return new InMemoryQuery(
        name,
        (store) => {
          return materializeNode<RowType>(getTreeRoot(node), store)
        },
        mode,
      )
    }

    throw new QueryError("Node is not a RelationalQueryNode")
  }
}

export class ParameterizedInMemoryRelationalQueryBuilder<
  RowType extends RelationalDataTable,
  ParameterType extends QueryParameters,
> extends ParameterizedRelationalQueryBuilder<RowType, ParameterType> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }

  protected override buildQuery(
    node: QueryNode,
    name: string,
    mode: ExecutionMode,
  ): ParameterizedQuery<RowType, ParameterType> {
    // Verify we have a relational node
    if (isRelationalQueryNode(node) && isGenerator(node)) {
      return new ParameterizedInMemoryQuery(
        name,
        (store, parameters) => {
          return materializeNode<RowType>(getTreeRoot(node), store, parameters)
        },
        mode,
      )
    }

    throw new QueryError("Node is not a RelationalQueryNode")
  }
}

type Projections = Map<
  keyof RelationalDataStore["tables"],
  RelationalDataTable[]
>

// Internal symbols for tracking projected information
const ORIGINAL: unique symbol = Symbol()

// Need to a way to identified original row sources for joins
type RowPointer<T> = RelationalDataTable & {
  [ORIGINAL]: T
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

class MaterializerContext {
  projections: Projections = new Map()
  store: InMemoryRelationalDataStore<RelationalDataStore>

  constructor(store: InMemoryRelationalDataStore<RelationalDataStore>) {
    this.store = store
  }

  get(table: keyof RelationalDataStore["tables"]): RelationalDataTable[] {
    return (
      this.projections.get(table) ??
      (table in this.store ? this.store[table].map(makePointer) : [])
    )
  }

  set(
    table: keyof RelationalDataStore["tables"],
    rows: RelationalDataTable[],
  ): void {
    this.projections.set(table, rows)
  }
}

function materializeTable(
  table: TableQueryNode,
  context: MaterializerContext,
  parameters?: QueryParameters,
): RelationalDataTable[] {
  let ret: RelationalDataTable[] = []
  let rows = context.get(table.tableName)

  const manager = new TableNodeManager(table)

  // Check for any filters to apply
  if (manager.where !== undefined) {
    rows = rows.filter(buildFilter(manager.where.filter, parameters))
  }

  // Apply any select projections on the set firts
  if (manager.select !== undefined) {
    ret = rows.map((r) => {
      const entries: (readonly [PropertyKey, object])[] = []

      const transform = new Map<string, string>()
      for (const alias of manager.columnAlias ?? []) {
        transform.set(alias.column, alias.alias)
      }

      if (manager.select.columns === "*") {
        Object.keys(r).map((c) =>
          entries.push([transform.has(c) ? transform.get(c)! : c, r[c]]),
        )
      } else {
        manager.select.columns.map((c) =>
          entries.push([transform.has(c) ? transform.get(c)! : c, r[c]]),
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
  join: JoinQueryNode,
  context: MaterializerContext,
  parameters?: QueryParameters,
): RelationalDataTable[] {
  let rows: RelationalDataTable[] = []

  const manager = new JoinNodeManager(join)

  // Need to find all the table nodes and map them to data
  const tables = new Map<
    keyof RelationalDataStore["tables"],
    RowPointer<RelationalDataTable>[]
  >()
  for (const table of manager.tables) {
    tables.set(
      table.tableName,
      materializeTable(table, context, parameters).filter(isRowPointer),
    )
  }

  // Apply all the filtering sets before joining
  for (const filter of manager.filters) {
    const left = tables.get(filter.left)!
    const right = tables.get(filter.right)!

    const check = buildJoinFilter(filter.filter)

    tables.set(
      filter.left,
      left.filter((l) => right.some((r) => check(l, r))),
    )
    tables.set(
      filter.right,
      right.filter((r) => left.some((l) => check(l, r))),
    )

    // Early abandon filters that generate no valid rows
    if (
      tables.get(filter.left)!.length === 0 ||
      tables.get(filter.right)!.length === 0
    ) {
      return []
    }
  }

  // Build all the rows...
  for (const filter of manager.filters) {
    const left = tables.get(filter.left)!
    const right = tables.get(filter.right)!

    const check = buildJoinFilter(filter.filter)

    const current = [...rows]
    rows = []
    for (const l of left) {
      for (const r of right.filter((r) => check(l, r))) {
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

  return rows
}

function materializeCte(
  cte: CteClause,
  context: MaterializerContext,
  parameters?: QueryParameters,
): RelationalQueryNode<RelationalNodeType> | undefined {
  if (isRelationalQueryNode(cte.source)) {
    switch (true) {
      case isTableQueryNode(cte.source):
        context.set(
          cte.tableName,
          materializeTable(cte.source, context, parameters),
        )
        break
      case isJoinQueryNode(cte.source):
        context.set(
          cte.tableName,
          materializeJoin(cte.source, context, parameters),
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

function materializeTableAlias(
  root: RelationalQueryNode<RelationalNodeType>,
  context: MaterializerContext,
): void {
  const nodes: RelationalQueryNode<RelationalNodeType>[] = [root]
  while (nodes.length > 0) {
    const next = nodes.shift()!

    // Any tables that are pulling from an alias need to have that alias created
    if (isTableQueryNode(next) && next.alias) {
      context.set(next.tableName, context.get(next.alias))
    }

    nodes.push(...(next.children?.filter(isRelationalQueryNode) ?? []))
  }
}

function materializeProjections(
  root: RelationalQueryNode<RelationalNodeType>,
  context: MaterializerContext,
  parameters?: QueryParameters,
): RelationalQueryNode<RelationalNodeType> {
  // Fill any table projections
  materializeTableAlias(root, context)

  let current = root
  while (current) {
    if (isTableQueryNode(current) || isJoinQueryNode(current)) {
      return current
    }

    if (isCteClause(current)) {
      current = materializeCte(current, context, parameters)!
    } else {
      throw new QueryError(`Unspuported projection type: ${current.nodeType}`)
    }
  }

  return current
}

function materializeNode<RowType extends RelationalDataTable>(
  root: RelationalQueryNode<RelationalNodeType>,
  store: InMemoryRelationalDataStore<RelationalDataStore>,
  parameters?: QueryParameters,
): RowType[] {
  const context = new MaterializerContext(store)

  const current = hasProjections(root)
    ? materializeProjections(root, context, parameters)
    : root

  if (isTableQueryNode(current)) {
    return materializeTable(current, context, parameters) as RowType[]
  } else if (isJoinQueryNode(current)) {
    return materializeJoin(current, context, parameters) as RowType[]
  } else {
    throw new QueryError(`Unsupported generator type: ${current.nodeType}`)
  }
}

function buildJoinFilter<
  LeftTable extends RelationalDataTable,
  RightTable extends RelationalDataTable,
>(
  filter: JoinColumnFilter,
): (l: RowPointer<LeftTable>, r: RowPointer<RightTable>) => boolean {
  return (l, r) =>
    (l[ORIGINAL][filter.leftColumn] as unknown) ===
    (r[ORIGINAL][filter.rightColumn] as unknown)
}

function buildFilter<ParameterType extends QueryParameters = never>(
  clause: FilterGroup<RelationalDataTable> | FilterTypes<RelationalDataTable>,
  parameters?: ParameterType,
): (input: RelationalDataTable) => boolean {
  if (isFilterGroup(clause)) {
    const filters = clause.filters.map((f) => buildFilter(f, parameters))
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
    return buildArrayFilter(clause, parameters)
  } else if (isStringFilter(clause)) {
    return buildStringFilter(clause, parameters)
  } else if (isColumnFilter(clause)) {
    return buildColumnFilter(clause, parameters)
  }

  return (_) => false
}

function buildArrayFilter<ParameterType extends QueryParameters = never>(
  columnFilter: ArrayFilter<
    RelationalDataTable,
    ArrayProperty<RelationalDataTable>,
    ArrayItemType<RelationalDataTable, ArrayProperty<RelationalDataTable>>
  >,
  parameters?: ParameterType,
): (input: RelationalDataTable) => boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const value: any = isParameterNode(columnFilter.value)
    ? parameters![columnFilter.value.name]
    : columnFilter.value

  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column] as unknown[]

        if (Array.isArray(value)) {
          return value.some((val) => v.includes(val))
        }

        return v.includes(value)
      }
  }
}

function buildStringFilter<ParameterType extends QueryParameters = never>(
  columnFilter: StringFilter<
    RelationalDataTable,
    PropertyOfType<RelationalDataTable, string>
  >,
  parameters?: ParameterType,
): (input: RelationalDataTable) => boolean {
  const value = isParameterNode(columnFilter.value)
    ? (parameters![columnFilter.value.name] as string)
    : columnFilter.value

  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column] as string
        return v.indexOf(value) >= 0
      }
  }
}

function buildColumnFilter<ParameterType extends QueryParameters = never>(
  columnFilter: ColumnFilter<RelationalDataTable, keyof RelationalDataTable>,
  parameters?: ParameterType,
): (input: RelationalDataTable) => boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const value: any = isParameterNode(columnFilter.value)
    ? parameters![columnFilter.value.name]
    : columnFilter.value

  switch (columnFilter.op) {
    case ColumnFilteringOperation.EQ:
      return (row) => row[columnFilter.column] === value
    case ColumnFilteringOperation.GT:
      return (row) => row[columnFilter.column] > value
    case ColumnFilteringOperation.GTE:
      return (row) => row[columnFilter.column] >= value
    case ColumnFilteringOperation.LT:
      return (row) => row[columnFilter.column] < value
    case ColumnFilteringOperation.LTE:
      return (row) => row[columnFilter.column] <= value
  }
}
