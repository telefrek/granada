/**
 * Postgres pooling
 */

import { DeferredPromise } from "@telefrek/core"
import { debug, error } from "@telefrek/core/logging"
import { PoolBase, type PoolOptions } from "@telefrek/core/structures/pool.js"
import pg from "pg"

const SAFE_INT_REGEX = /^(-)?[0-8]?\d{1,15}$/

const safeBigInt = (v: string) => {
  return SAFE_INT_REGEX.test(v)
    ? Number(v) // If number is less than 16 digits that start with a 9 we don't care
    : (v.startsWith("-") ? v.substring(1) : v) > "9007199254740991"
      ? BigInt(v)
      : Number(v)
}
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) =>
  v ? safeBigInt(v) : null,
)
pg.types.setTypeParser(pg.types.builtins.INT8, (v) =>
  v ? safeBigInt(v) : null,
)

export interface PostgresConfiguration {
  user: string
  password: string
  database: string
  host: string
  connectionTimeout?: number
  port?: number
}

/**
 * Options for controlling the behavior of a {@link PostgresConnectionPool}
 */
export interface PostgresPoolOptions extends PoolOptions {
  clientConfig: PostgresConfiguration | string
}

/**
 * Default implementation of a {@link PoolBase} for postgres
 */
export class PostgresConnectionPool extends PoolBase<pg.Client> {
  _clientConfig: pg.ClientConfig

  constructor(options: PostgresPoolOptions) {
    super(options)
    this._clientConfig =
      typeof options.clientConfig === "object"
        ? {
            ...options.clientConfig,
          }
        : {
            connectionString: options.clientConfig,
          }
  }

  override checkIfValid(_item: pg.Client, _reason?: unknown): boolean {
    // TODO: Actually implement this
    return true
  }

  override recycleItem(item: pg.Client): void {
    debug(`Recycling pg.Client`)
    item.end((err) => {
      if (err) {
        error(`Failure during client.end ${err}`, err)
      }
    })
  }

  override createItem(): Promise<pg.Client> {
    debug(`Creating new pg.Client ${this._clientConfig.host ?? "unknown host"}`)
    const deferred = new DeferredPromise<pg.Client>()
    const client = new pg.Client(this._clientConfig)
    client.connect((err) => {
      if (!err) {
        debug(`Created client successfully`)
        deferred.resolve(client)
      } else {
        error(`Failed to create pg.Client: ${err}`, err)
        deferred.reject(err)
      }
    })

    return deferred
  }
}
