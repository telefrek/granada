/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Timer } from "@telefrek/core/time/index"
import type { RelationalQueryBuilder, SQLDataStore, SQLDataTable } from ".."
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  type BoundQuery,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryExecutor,
  type QueryNode,
  type QueryResult,
  type RowType,
  type SimpleQuery,
} from "../.."
import { QueryError } from "../../error"
import { getTreeRoot } from "../../sql/helpers"
import { isSQLQueryNode } from "../ast/typeGuards"
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

  run<T extends RowType, P extends QueryParameters>(
    query: SimpleQuery<T> | BoundQuery<T, P>,
  ): Promise<QueryResult<T>> {
    if ("source" in query && typeof query.source === "function") {
      const timer = new Timer()
      const rows = query.source(this.store, query) as T[]

      const result: QueryResult<T> =
        query.mode === ExecutionMode.Normal
          ? {
              mode: query.mode,
              duration: timer.stop(),
              rows,
            }
          : {
              mode: query.mode,
              duration: timer.stop(),
              stream: {
                [Symbol.asyncIterator]() {
                  return (async function* () {
                    for (const r of rows) {
                      yield r
                    }
                  })()
                },
              },
            }

      return Promise.resolve(result)
    }

    throw new QueryError("Invalid qurey type")
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

export class InMemoryQueryBuilder<D extends SQLDataStore>
  implements RelationalQueryBuilder<D>
{
  build<
    Q extends BuildableQueryTypes,
    R extends RowType,
    P extends QueryParameters,
  >(
    node: QueryNode,
    queryType: Q,
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    if (mode === undefined) {
      throw new QueryError("missing mode!!!")
    }
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
