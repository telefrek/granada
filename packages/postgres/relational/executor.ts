/**
 * Executor for queries
 */

import { Timer } from "@telefrek/core/time/index"
import { makeCaseInsensitive } from "@telefrek/core/type/utils"
import { QueryError } from "@telefrek/query/error"
import {
  QueryType,
  type BoundQuery,
  type QueryExecutor,
  type QueryParameters,
  type QueryResult,
  type RowType,
  type SimpleQuery,
  type StreamingQueryResult,
} from "@telefrek/query/index"
import pg from "pg"
import { isPostgresQuery } from "./builder"

export class PostgresQueryExecutor implements QueryExecutor {
  #client: pg.Client

  constructor(client: pg.Client) {
    this.#client = client
  }

  async run<T extends RowType, P extends QueryParameters>(
    query: SimpleQuery<T> | BoundQuery<T, P>,
  ): Promise<QueryResult<T, P> | StreamingQueryResult<T, P>> {
    if (isPostgresQuery(query)) {
      const timer = new Timer()
      timer.start()

      const parameters: unknown[] | undefined =
        query.queryType === QueryType.BOUND
          ? Array.from(query.context.parameterMapping.keys())
              .sort(
                (a, b) =>
                  query.context.parameterMapping.get(a)! -
                  query.context.parameterMapping.get(b)!,
              )
              .map((k) => query.parameters[k])
          : undefined

      try {
        const results = await this.#client.query(query.queryText, parameters)

        // Postgres doesn't care about casing in most places, so we need to make our results agnostic as well...
        if (results.rows) {
          return {
            query,
            duration: timer.elapsed(),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
            rows: results.rows.map((r) => makeCaseInsensitive(r as T)),
          }
        }
      } catch (err) {
        console.log(err)
      }

      throw new QueryError("failed to execute query")
    }
    throw new QueryError("Unsupported query type")
  }
}
