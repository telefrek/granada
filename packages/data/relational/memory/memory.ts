/**
 * Set of utilities to treat in memory collections as a pseudo relational data store
 */

import { Duration } from "@telefrek/core/time/index"
import type {
  QueryParameters,
  RelationalDataStore,
  RelationalDataTable,
} from ".."
import {
  ExecutionMode,
  Query,
  isParameterizedQuery,
  type ParameterizedQuery,
  type QueryExecutor,
  type QueryResult,
  type StreamingQueryResult,
} from "../../query"
import type { QueryNode } from "../../query/ast"
import { QueryError } from "../../query/error"
import {
  isGenerator,
  isRelationalQueryNode,
  type RelationalQueryNode,
} from "../ast"
import {
  ParameterizedRelationalQueryBuilder,
  RelationalQueryBuilder,
} from "../builder"
import { getTreeRoot } from "../helpers"
import { RelationalNodeType } from "../types"
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
