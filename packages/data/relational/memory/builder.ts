/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type { RelationalDataStore, RelationalDataTable } from ".."
import {
  ExecutionMode,
  QueryParameters,
  type Query,
  type QueryExecutor,
  type QueryResult,
  type QueryType,
  type StreamingQueryResult,
} from "../../query"
import { type RelationalNodeType, type RelationalQueryNode } from "../ast"
import { getTreeRoot } from "../helpers"
import { materializeNode } from "./astParser"

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
    query: Query<QueryType, RowType, never>,
  ): Promise<QueryResult<RowType> | StreamingQueryResult<RowType>> {
    if ("source" in query && typeof query.source === "function") {
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

type InMemQ<
  D extends RelationalDataStore,
  Q extends QueryType,
  R extends RelationalDataTable,
> = Q extends QueryType.RAW
  ? {
      queryType: Q
      name: string
      mode: ExecutionMode
      source: InMemoryQuerySourceMaterializer<D, R>
    }
  : Q extends QueryType.PARAMETERIZED
    ? {
        queryType: Q
        name: string
        mode: ExecutionMode
        source: InMemoryQuerySourceMaterializer<D, R>
      }
    : never

export const InMemoryRelationalQueryBuilder1 = <
  D extends RelationalDataStore,
  Q extends QueryType,
  R extends RelationalDataTable,
  P extends QueryParameters = never,
>(
  node: RelationalQueryNode<RelationalNodeType>,
  q: Q,
  name: string,
  mode: ExecutionMode = ExecutionMode.Normal,
): Query<Q, R, P> => {
  return {
    queryType: q,
    source: (store) => {
      return materializeNode<R>(getTreeRoot(node), store)
    },
    name,
    mode,
  } as InMemQ<D, Q, R>
}
