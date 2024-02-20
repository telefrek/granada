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
import type { QueryNode, QuerySource } from "../query/ast"
import { RelationalQueryBuilder } from "./queryBuilder"

export type InMemoryTable<T> = T[]

/**
 * Provide an in memory data store
 */
export interface InMemoryRelationalDataStore<T extends RelationalDataStore> {
  sources: {
    [key in keyof T["tables"]]: InMemoryTable<T["tables"][key]>
  }
}

export function createInMemoryStore<
  T extends RelationalDataStore
>(): InMemoryRelationalDataStore<T> {
  return {
    sources: {},
  } as InMemoryRelationalDataStore<T>
}

class InMemoryQuery<T, D extends RelationalDataStore> implements Query<T> {
  name: string
  mode: ExecutionMode
  s: sure

  constructor(
    name: string,
    s: sure,
    mode: ExecutionMode = ExecutionMode.Normal
  ) {
    this.name = name
    this.mode = mode
    this.s = s
  }
}

function isInMemoryQuery<T, D extends RelationalDataStore>(
  query: Query<T>
): query is InMemoryQuery<T, D> {
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

export function from<
  D extends RelationalDataStore,
  T extends keyof D["tables"]
>(
  table: T,
  _source: QuerySource<D["tables"][T]>
): InMemoryRelationalQueryBuilder<D> {
  return new InMemoryRelationalQueryBuilder(
    new InMemoryQuery<unknown, D>(
      "testQuery",
      (store: InMemoryRelationalDataStore<D>) => {
        // Add items
        if (store.sources[table] === undefined) {
          store.sources[table] = []
        }
        return store.sources[table].map((r) => r as any)
      }
    )
  )
}

type sure = <D extends RelationalDataStore, T = unknown>(
  store: InMemoryRelationalDataStore<D>
) => T[]

export class InMemoryRelationalQueryBuilder<
  T extends RelationalDataStore
> extends RelationalQueryBuilder {
  query: InMemoryQuery<unknown, T>

  constructor(query: InMemoryQuery<unknown, T>) {
    super()
    this.query = query
  }

  protected override buildQuery<T>(ast: QueryNode): Query<T> {
    return this.query as Query<T>
  }
}
