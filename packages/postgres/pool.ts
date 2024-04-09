/**
 * Postgres pooling
 */

import { Client, type ClientConfig } from "pg"
import { PoolBase, type PoolOptions } from "../core/structures/pool"

/**
 * Options for controlling the behavior of a {@link PostgresConnectionPool}
 */
export interface PostgresPoolOptions extends PoolOptions {
  clientConfig: ClientConfig
}

/**
 * Default implementation of a {@link PoolBase} for postgres
 */
export class PostgresConnectionPool extends PoolBase<Client> {
  _clientConfig: ClientConfig

  constructor(options: PostgresPoolOptions) {
    super(options)
    this._clientConfig = options.clientConfig
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
    const client = new Client(this._clientConfig)
    await client.connect()

    return client
  }
}
