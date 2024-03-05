/**
 * Wrap the pg library calls
 */

import { PostgresQuery, PostgresQueryResult, isBoundQuery } from "./query"

import { Client } from "pg"

/**
 * Thin wrapper around a database
 */
export interface Database {
  runQuery<R extends any = any>(
    query: PostgresQuery,
  ): Promise<PostgresQueryResult<R>>
}

export function createDatabase(): Database {
  return new TestDatabase()
}

class TestDatabase implements Database {
  #client: Client | undefined

  async runQuery<R extends any = any>(
    query: PostgresQuery,
  ): Promise<PostgresQueryResult<R>> {
    if (this.#client === undefined) {
      this.#client = new Client({
        host: "localhost",
        port: 5432,
        user: "postgres",
        password: "password123",
        database: "postgres",
      })

      // Connect
      await this.#client.connect()
    }

    const result = await this.#client.query(
      query.text,
      isBoundQuery(query) ? query.args : undefined,
    )

    const ret = {
      query,
    } as PostgresQueryResult<R>

    if (result.rowCount ?? 0 > 0) {
      ret.rows = result.rows as R[]
      ret.hasRows = true
    }

    return ret
  }
}
