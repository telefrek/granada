/**
 * Basic abstractions for Postgres
 */

import { PoolBase, type PoolOptions } from "@telefrek/core/structures/pool"
import { ExecutionMode, QueryParameters } from "@telefrek/query"
import { Client, type ClientConfig, type QueryConfig } from "pg"

export interface PostgresPoolOptions extends PoolOptions {
  clientConfig: ClientConfig
}

export class Database extends PoolBase<Client> {
  #clientConfig: ClientConfig

  constructor(options: PostgresPoolOptions) {
    super(options)
    this.#clientConfig = options.clientConfig
  }

  override checkIfValid(_item: Client, _reason?: unknown): boolean {
    // TODO: Actually implement this
    return true
  }

  override recycleItem(item: Client): void {
    item.end((_) => {
      // TODO: Add error tracking
    })
  }

  override async createItem(): Promise<Client> {
    const client = new Client(this.#clientConfig)
    await client.connect()

    return client
  }
}

export type QueryMaterializer = (parameters: QueryParameters) => {
  text: string
  values?: unknown[]
}

export interface PostgresQuery<R extends unknown[] = never>
  extends QueryConfig<R> {
  mode: ExecutionMode
  name: string
  materializer?: QueryMaterializer
}

export interface PostgresStreamingQuery<R extends unknown[] = never>
  extends PostgresQuery<R> {
  mode: ExecutionMode.Streaming
}

export function isPostgresQuery(query: unknown): query is PostgresQuery {
  return (
    typeof query === "object" &&
    query !== null &&
    "mode" in query &&
    typeof query.mode === "string" &&
    Object.values(ExecutionMode).includes(query.mode as ExecutionMode)
  )
}
