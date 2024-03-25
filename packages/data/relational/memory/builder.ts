/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type { RelationalDataStore, RelationalDataTable } from ".."
import {
  ExecutionMode,
  QueryParameters,
  type BoundQuery,
  type ParameterizedQuery,
  type QueryExecutor,
  type QueryResult,
  type RowType,
  type SimpleQuery,
  type StreamingQueryResult,
} from "../../query"
import type {
  QueryBuilder,
  SupportedQueryTypes,
} from "../../relational/builder/index"
import { getTreeRoot } from "../../relational/helpers"
import { type RelationalNodeType, type RelationalQueryNode } from "../ast"
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

  run<R extends RowType, P extends QueryParameters>(
    query: SimpleQuery<R> | BoundQuery<R, P>,
  ): Promise<QueryResult<R, P> | StreamingQueryResult<R, P>> {
    if ("source" in query && typeof query.source === "function") {
      const res = query.source(this.store, query)
      return Promise.resolve({
        rows: res,
        duration: Duration.ZERO,
      } as QueryResult<R, P>)
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
  R extends RelationalDataTable,
  P extends QueryParameters,
> = [P] extends [never]
  ? SimpleQuery<R> & {
      source: InMemoryQuerySourceMaterializer<D, R>
    }
  : ParameterizedQuery<R, P> & {
      source: InMemoryQuerySourceMaterializer<D, R>
    }

export function createMemoryBuilder<
  D extends RelationalDataStore,
  Q extends SupportedQueryTypes,
  R extends RelationalDataTable,
  P extends QueryParameters,
>(): QueryBuilder<Q, R, P> {
  return (
    node: RelationalQueryNode<RelationalNodeType>,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
    parameters?: P,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> => {
    return {
      queryType,
      source: (store) => {
        return materializeNode<R>(getTreeRoot(node), store)
      },
      name,
      mode,
      parameters,
    } as InMemQ<D, R, P>
  }
}
