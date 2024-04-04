/**
 * Postgres pooling
 */

import { PoolBase, type PoolOptions } from "@telefrek/core/structures/pool"
import pg from "pg"

export interface PostgresPoolOptions extends PoolOptions {
  clientConfig: pg.ClientConfig
}

export class PostgresPool extends PoolBase<pg.Client> {
  #clientConfig: pg.ClientConfig

  constructor(options: PostgresPoolOptions) {
    super(options)
    this.#clientConfig = options.clientConfig
  }

  override checkIfValid(_item: pg.Client, _reason?: unknown): boolean {
    // TODO: Actually implement this
    return true
  }

  override recycleItem(item: pg.Client): void {
    item.end((_) => {
      // TODO: Add error tracking
    })
  }

  override async createItem(): Promise<pg.Client> {
    const client = new pg.Client(this.#clientConfig)
    await client.connect()

    return client
  }
}
