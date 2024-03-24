/**
 * Executor for queries
 */

import { Timer } from "@telefrek/core/time/index"
import { makeCaseInsensitive } from "@telefrek/core/type/utils"
import { QueryError } from "@telefrek/data/query/error"
import type {
  Query,
  QueryExecutor,
  QueryResult,
  QueryType,
  StreamingQueryResult,
} from "@telefrek/data/query/index"
import pg from "pg"
import { isPostgresRelationalQuery } from "./builder"

export class PostgresQueryExecutor implements QueryExecutor {
  #client: pg.Client

  constructor(client: pg.Client) {
    this.#client = client
  }

  async run<T extends object>(
    query: Query<QueryType, T, never>,
  ): Promise<QueryResult<T> | StreamingQueryResult<T>> {
    if (isPostgresRelationalQuery(query)) {
      const timer = new Timer()
      timer.start()
      const results = await this.#client.query(query.queryText)

      // Postgres doesn't care about casing in most places, so we need to make our results agnostic as well...
      if (results.rows) {
        return {
          query,
          duration: timer.elapsed(),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
          rows: results.rows.map((r) => makeCaseInsensitive(r as T)),
        }
      }

      throw new QueryError("failed to execute query")
    }
    throw new QueryError("Unsupported query type")
  }
}
