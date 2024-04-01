/**
 * Contains the logic for parsing an {@link SQLQueryNode} AST into a set of in memory operations
 */

import { QueryError } from "../../error"
import type { QueryParameters } from "../../index"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  IsArrayFilter,
  isColumnFilter,
  isCteClause,
  isFilterGroup,
  isInsertClause,
  isJoinQueryNode,
  isParameterNode,
  isSQLQueryNode,
  isStringFilter,
  isTableQueryNode,
  type ArrayFilter,
  type ColumnFilter,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type InsertClause,
  type JoinColumnFilter,
  type JoinQueryNode,
  type SQLNodeType,
  type SQLQueryNode,
  type StringFilter,
  type TableQueryNode,
} from "../../sql/ast"
import {
  JoinNodeManager,
  TableNodeManager,
  hasProjections,
} from "../../sql/helpers"
import type { SQLDataStore, SQLDataTable } from "../../sql/index"
import type { InMemoryRelationalDataStore } from "./builder"

export function materializeNode<RowType extends SQLDataTable>(
  root: SQLQueryNode<SQLNodeType>,
  store: InMemoryRelationalDataStore<SQLDataStore>,
  parameters?: QueryParameters,
): RowType[] | undefined {
  const context = new MaterializerContext(store)

  const current = hasProjections(root)
    ? materializeProjections(root, context, parameters)
    : root

  if (isTableQueryNode(current)) {
    return materializeTable(current, context, parameters) as RowType[]
  } else if (isJoinQueryNode(current)) {
    return materializeJoin(current, context, parameters) as RowType[]
  } else if (isInsertClause(current)) {
    return materializeInsert(current, context, parameters!) as RowType[]
  } else {
    throw new QueryError(`Unsupported generator type: ${current.nodeType}`)
  }
}

/**
 * Simple type rename
 */
type Projections = Map<keyof SQLDataStore["tables"], SQLDataTable[]>

// Internal symbols for tracking projected information
const ORIGINAL: unique symbol = Symbol()

// Need to a way to identified original row sources for joins
type RowPointer<T> = SQLDataTable & {
  [ORIGINAL]: T
} & T

function isRowPointer<T>(row: T): row is RowPointer<T> {
  return typeof row === "object" && row !== null && ORIGINAL in row
}

function makePointer<T extends object>(row: T): RowPointer<T> {
  return isRowPointer(row)
    ? row
    : {
        ...row,
        [ORIGINAL]: row,
      }
}

class MaterializerContext {
  projections: Projections = new Map()
  store: InMemoryRelationalDataStore<SQLDataStore>

  constructor(store: InMemoryRelationalDataStore<SQLDataStore>) {
    this.store = store
  }

  get(table: keyof SQLDataStore["tables"]): SQLDataTable[] {
    return (
      this.projections.get(table) ??
      (table in this.store ? this.store[table].map(makePointer) : [])
    )
  }

  set(table: keyof SQLDataStore["tables"], rows: SQLDataTable[]): void {
    this.projections.set(table, rows)
  }
}

function materializeInsert(
  insert: InsertClause,
  context: MaterializerContext,
  parameters: QueryParameters,
): SQLDataTable[] | undefined {
  context.store[insert.tableName].push(parameters)

  if (insert.returning) {
    if (insert.returning === "*") {
      return [parameters]
    }

    return [
      Object.fromEntries(
        insert.returning.map((r) => [r as PropertyKey, parameters[r]]),
      ) as SQLDataTable,
    ]
  }

  return
}

function materializeTable(
  table: TableQueryNode,
  context: MaterializerContext,
  parameters?: QueryParameters,
): SQLDataTable[] {
  let ret: SQLDataTable[] = []
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

      return Object.fromEntries(entries) as SQLDataTable
    })
  }

  return ret
}

function materializeJoin(
  join: JoinQueryNode,
  context: MaterializerContext,
  parameters?: QueryParameters,
): SQLDataTable[] {
  let rows: SQLDataTable[] = []

  const manager = new JoinNodeManager(join)

  // Need to find all the table nodes and map them to data
  const tables = new Map<
    keyof SQLDataStore["tables"],
    RowPointer<SQLDataTable>[]
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
        const m: SQLDataTable = { ...l, ...r }
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
): SQLQueryNode<SQLNodeType> | undefined {
  if (isTableQueryNode(cte.source)) {
    context.set(
      cte.tableName,
      materializeTable(cte.source, context, parameters),
    )
  } else if (isJoinQueryNode(cte.source)) {
    context.set(cte.tableName, materializeJoin(cte.source, context, parameters))
  }

  if (cte.children) {
    return cte.children
      .filter(isSQLQueryNode)
      .filter((r) => r !== cte.source) // Filter select and where
      .at(0)
  }

  return
}

function materializeTableAlias(
  root: SQLQueryNode<SQLNodeType>,
  context: MaterializerContext,
): void {
  const nodes: SQLQueryNode<SQLNodeType>[] = [root]
  while (nodes.length > 0) {
    const next = nodes.shift()!

    // Any tables that are pulling from an alias need to have that alias created
    if (isTableQueryNode(next) && next.alias) {
      context.set(next.tableName, context.get(next.alias))
    }

    nodes.push(...(next.children?.filter(isSQLQueryNode) ?? []))
  }
}

function materializeProjections(
  root: SQLQueryNode<SQLNodeType>,
  context: MaterializerContext,
  parameters?: QueryParameters,
): SQLQueryNode<SQLNodeType> {
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

function buildJoinFilter<
  LeftTable extends SQLDataTable,
  RightTable extends SQLDataTable,
>(
  filter: JoinColumnFilter,
): (l: RowPointer<LeftTable>, r: RowPointer<RightTable>) => boolean {
  return (l, r) =>
    (l[ORIGINAL][filter.leftColumn] as unknown) ===
    (r[ORIGINAL][filter.rightColumn] as unknown)
}

function buildFilter<ParameterType extends QueryParameters = never>(
  clause: FilterGroup | FilterTypes,
  parameters?: ParameterType,
): (input: SQLDataTable) => boolean {
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
  columnFilter: ArrayFilter,
  parameters?: ParameterType,
): (input: SQLDataTable) => boolean {
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
  columnFilter: StringFilter,
  parameters?: ParameterType,
): (input: SQLDataTable) => boolean {
  const value = isParameterNode(columnFilter.value)
    ? (parameters![columnFilter.value.name] as string)
    : columnFilter.value

  switch (columnFilter.op) {
    case ColumnValueContainsOperation.IN:
      return (row) => {
        const v = row[columnFilter.column] as string
        return v.indexOf(value as string) >= 0
      }
  }
}

function buildColumnFilter<ParameterType extends QueryParameters = never>(
  columnFilter: ColumnFilter,
  parameters?: ParameterType,
): (input: SQLDataTable) => boolean {
  if (columnFilter.source === "null") {
    return (row) => row[columnFilter.column] === null
  }

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
