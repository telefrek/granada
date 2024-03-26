/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type { SQLDataStore, SQLDataTable } from ".."
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
import { getTreeRoot } from "../../sql/helpers"
import { isSQLQueryNode } from "../ast"
import { materializeNode } from "./astParser"

/**
 * Define an in memory table as an array of the given {@link TableType}
 */
export type InMemoryTable<TableType> = TableType[]

/**
 * Define an in memory {@link SQLDataStore} as a collection of table
 * name, {@link InMemoryTable} for the given type
 */
export type InMemoryRelationalDataStore<DataStoreType extends SQLDataStore> = {
  [key in keyof DataStoreType["tables"]]: InMemoryTable<
    DataStoreType["tables"][key]
  >
}

export function createInMemoryStore<
  DataStoreType extends SQLDataStore,
>(): InMemoryRelationalDataStore<DataStoreType> {
  return {
    sources: {},
  } as InMemoryRelationalDataStore<DataStoreType>
}

export class InMemoryQueryExecutor<DataStoreType extends SQLDataStore>
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
  DataStoreType extends SQLDataStore,
  RowType,
> = (
  store: InMemoryRelationalDataStore<DataStoreType>,
  parameters?: QueryParameters,
) => RowType[] | undefined

type InMemoryQuery<D extends SQLDataStore, R extends SQLDataTable> = {
  source: InMemoryQuerySourceMaterializer<D, R>
}

type SimpleInMemoryQuery<
  D extends SQLDataStore,
  R extends SQLDataTable,
> = SimpleQuery<R> & InMemoryQuery<D, R>

type ParameterizedInMemoryQuery<
  D extends SQLDataStore,
  R extends SQLDataTable,
  P extends QueryParameters,
> = ParameterizedQuery<R, P> & InMemoryQuery<D, R>

type BoundInMemoryQuery<
  D extends SQLDataStore,
  R extends SQLDataTable,
  P extends QueryParameters,
> = BoundQuery<R, P> & InMemoryQuery<D, R>

export function InMemoryQueryBuilder<
  D extends SQLDataStore,
  Q extends BuildableQueryTypes,
  R extends SQLDataTable,
  P extends QueryParameters,
>(): QueryProvider<Q, R, P> {
  return (
    node: QueryNode,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> => {
    if (isSQLQueryNode(node)) {
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
