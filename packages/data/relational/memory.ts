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
  ContainmentOp,
  FilterOp,
  RelationalNodeTypes,
  isColumnFilter,
  isContainmentFilter,
  isRelationalQueryNode,
  isTableQueryNode,
  type ColumnFilter,
  type ContainmentFilter,
  type ContainmentItemType,
  type ContainmentProperty,
  type RelationalQueryNode,
} from "./ast"
import { RelationalQueryBuilder } from "./builder"

export type InMemoryTable<T> = T[]

/**
 * Provide an in memory data store
 */
export type InMemoryRelationalDataStore<T extends RelationalDataStore> = Record<
  keyof T["tables"],
  InMemoryTable<T["tables"][keyof T["tables"]]>
>

export function createInMemoryStore<
  T extends RelationalDataStore
>(): InMemoryRelationalDataStore<T> {
  return {
    sources: {},
  } as InMemoryRelationalDataStore<T>
}

type InMemoryQuerySourceFn<D extends RelationalDataStore, T> = (
  store: InMemoryRelationalDataStore<D>
) => T[]

class InMemoryQuery<D extends RelationalDataStore, T> implements Query<T> {
  name: string
  mode: ExecutionMode
  s: InMemoryQuerySourceFn<D, T>

  constructor(
    name: string,
    s: InMemoryQuerySourceFn<D, T>,
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    this.name = name
    this.mode = mode
    this.s = s
  }
}

function isInMemoryQuery<D extends RelationalDataStore, T>(
  query: Query<T>
): query is InMemoryQuery<D, T> {
  return (
    typeof query === "object" &&
    query !== null &&
    "s" in query &&
    typeof query.s === "function"
  )
}

export class InMemoryQueryExecutor<D extends RelationalDataStore>
  implements QueryExecutor
{
  store: InMemoryRelationalDataStore<D>

  constructor(inMemoryStore?: InMemoryRelationalDataStore<D>) {
    this.store = inMemoryStore ?? createInMemoryStore()
  }

  run<T>(query: Query<T>): Promise<QueryResult<T> | StreamingQueryResult<T>> {
    if (isInMemoryQuery(query)) {
      const res = query.s(this.store)
      return Promise.resolve({
        rows: res as T[],
        duration: Duration.ZERO,
      } as QueryResult<T>)
    }

    throw new Error("Method not implemented.")
  }
}

export class InMemoryRelationalQueryBuilder<
  D extends RelationalDataStore,
  T
> extends RelationalQueryBuilder<T> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeTypes>) {
    super(queryNode)
  }

  protected override buildQuery<T>(ast: QueryNode): Query<T> {
    // Verify we have a relational node
    if (isRelationalQueryNode(ast) && isTableQueryNode(ast)) {
      return new InMemoryQuery<D, T>("name", (source) => {
        let rows = source[ast.table] ?? []
        let ret: T[] = []

        // Check for any filters to apply
        if (ast.where !== undefined) {
          // Simple column filter
          if (isColumnFilter(ast.where.filter)) {
            rows = rows.filter(buildFilter(ast.where.filter))
          } else if (isContainmentFilter(ast.where.filter)) {
            rows = rows.filter(buildContainsFilter(ast.where.filter))
          }
        }

        // Apply any select projections on the set firts
        if (ast.select !== undefined) {
          ret = rows.map((r) => {
            const entries: Array<readonly [PropertyKey, any]> = []

            // TODO: handle aliasing
            const transform = new Map<string, string>()
            if (ast.select?.alias) {
              transform.set(ast.select!.alias.column, ast.select!.alias.alias)
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

function buildContainsFilter<T>(
  columnFilter: ContainmentFilter<
    T,
    ContainmentProperty<T>,
    ContainmentItemType<T, ContainmentProperty<T>>
  >
): (input: T) => boolean {
  switch (columnFilter.op) {
    case ContainmentOp.IN:
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

function buildFilter<T>(
  columnFilter: ColumnFilter<T, keyof T>
): (input: T) => boolean {
  switch (columnFilter.op) {
    case FilterOp.EQ:
      return (row) => row[columnFilter.column] === columnFilter.value
    case FilterOp.GT:
      return (row) => row[columnFilter.column] > columnFilter.value
    case FilterOp.GTE:
      return (row) => row[columnFilter.column] >= columnFilter.value
    case FilterOp.LT:
      return (row) => row[columnFilter.column] < columnFilter.value
    case FilterOp.LTE:
      return (row) => row[columnFilter.column] <= columnFilter.value
  }
}
