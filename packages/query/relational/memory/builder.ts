/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type { RelationalDataStore, RelationalDataTable } from ".."
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  type BoundQuery,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryExecutor,
  type QueryNode,
  type QueryProvider,
  type QueryResult,
  type RowType,
  type SimpleQuery,
  type StreamingQueryResult,
} from "../.."
import { QueryError } from "../../error"
import { getTreeRoot } from "../../relational/helpers"
import { isRelationalQueryNode } from "../ast"
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
) => RowType[] | undefined

type InMemoryQuery<
  D extends RelationalDataStore,
  R extends RelationalDataTable,
> = {
  source: InMemoryQuerySourceMaterializer<D, R>
}

type SimpleInMemoryQuery<
  D extends RelationalDataStore,
  R extends RelationalDataTable,
> = SimpleQuery<R> & InMemoryQuery<D, R>

type ParameterizedInMemoryQuery<
  D extends RelationalDataStore,
  R extends RelationalDataTable,
  P extends QueryParameters,
> = ParameterizedQuery<R, P> & InMemoryQuery<D, R>

type BoundInMemoryQuery<
  D extends RelationalDataStore,
  R extends RelationalDataTable,
  P extends QueryParameters,
> = BoundQuery<R, P> & InMemoryQuery<D, R>

export function InMemoryQueryBuilder<
  D extends RelationalDataStore,
  Q extends BuildableQueryTypes,
  R extends RelationalDataTable,
  P extends QueryParameters,
>(): QueryProvider<Q, R, P> {
  return (
    node: QueryNode,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> => {
    if (isRelationalQueryNode(node)) {
      const simple: SimpleInMemoryQuery<D, R> = {
        queryType: QueryType.SIMPLE,
        name,
        mode,
        source: (store) => {
          return materializeNode<R>(getTreeRoot(node), store)
        },
      }

      if (queryType === QueryType.SIMPLE) {
        return simple as never
      }

      const parameterized: ParameterizedInMemoryQuery<D, R, P> = {
        ...simple,
        queryType: QueryType.PARAMETERIZED,
        bind: (p: P): BoundQuery<R, P> => {
          return {
            parameters: p,
            source: (store) => {
              return materializeNode<R>(getTreeRoot(node), store, p)
            },
            name,
            mode,
            queryType: QueryType.BOUND,
          } as BoundInMemoryQuery<D, R, P>
        },
      }

      return parameterized as never
    }

    throw new QueryError("Invalid query node, expected RelationalQueryNode")
  }
}
