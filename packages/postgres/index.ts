/**
 * Wrap the pg library calls
 */

import {
  PostgresQuery,
  PostgresQueryResult,
  PostgresRow,
  isBoundQuery,
} from "./query"
import { PostgresTable } from "./schema"

import { Client } from "pg"

/**
 * Thin wrapper around a database
 */
export interface Database {
  runQuery<T extends PostgresTable, R extends Partial<PostgresRow<T>>>(
    query: PostgresQuery,
  ): Promise<PostgresQueryResult<T, R>>
}

export function createDatabase(): Database {
  return new TestDatabase()
}

class TestDatabase implements Database {
  async runQuery<T extends PostgresTable, R extends Partial<PostgresRow<T>>>(
    query: PostgresQuery,
  ): Promise<PostgresQueryResult<T, R>> {
    const client = new Client({
      host: "localhost",
      port: 5432,
      user: "postgres",
      password: "password123",
      database: "postgres",
    })

    // Connect
    await client.connect()

    const result = await client.query(
      query.text,
      isBoundQuery(query) ? query.args : undefined,
    )

    const ret = {
      query,
    } as PostgresQueryResult<T, R>

    if (result.rowCount ?? 0 > 0) {
      ret.rows = result.rows as R[]
      ret.hasRows = true
    }

    // Cleanup
    await client.end()

    return ret
  }
}
