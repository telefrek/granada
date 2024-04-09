/**
 * Executor for queries
 */

import { Duration, Timer } from "@telefrek/core/time/index"
import { makeCaseInsensitive } from "@telefrek/core/type/proxies"
import { QueryError } from "@telefrek/query/error"
import {
  ExecutionMode,
  type BoundQuery,
  type QueryExecutor,
  type QueryParameters,
  type QueryResult,
  type RowType,
  type SimpleQuery,
} from "@telefrek/query/index"
import pg from "pg"
import { isPostgresQuery } from ".."
import { GRANADA_METRICS_METER } from "../../core/observability/metrics"
import type { PoolItem } from "../../core/structures/pool"
import type { PostgresConnectionPool } from "../pool"

const SAFE_INT_REGEX = /^(-)?[0-8]?\d{1,15}$/

const safeBigInt = (v: string) => {
  return SAFE_INT_REGEX.test(v)
    ? Number(v) // If number is less than 16 digits that start with a 9 we don't care
    : (v.startsWith("-") ? v.substring(1) : v) > "9007199254740991"
      ? BigInt(v)
      : Number(v)
}

const QueryMetrics = {
  QueryExecutionDuration: GRANADA_METRICS_METER.createHistogram(
    "query_execution_time",
    {
      description: "The amount of time the query took to execute",
      unit: "s",
    },
  ),
  QueryErrors: GRANADA_METRICS_METER.createCounter("query_error", {
    description:
      "The number of errors that have been encountered for the query",
  }),
} as const

pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) =>
  v ? safeBigInt(v) : null,
)
pg.types.setTypeParser(pg.types.builtins.INT8, (v) =>
  v ? safeBigInt(v) : null,
)

export class PostgresQueryExecutor implements QueryExecutor {
  #pool: PostgresConnectionPool

  constructor(pool: PostgresConnectionPool) {
    this.#pool = pool
  }

  async run<T extends RowType, P extends QueryParameters>(
    query: SimpleQuery<T> | BoundQuery<T, P>,
  ): Promise<QueryResult<T>> {
    if (isPostgresQuery(query)) {
      const timer = new Timer()
      timer.start()

      let client: PoolItem<pg.Client> | undefined
      let error: unknown | undefined
      try {
        client = await this.#pool.get(Duration.fromMilli(500))

        // TODO: Update for cursors...
        // TODO: How do we want to deal with "named queries..." as well as
        // tracking duplicates
        const results = await client.item.query({ ...query, name: undefined })

        // TODO: What about errors
        QueryMetrics.QueryExecutionDuration.record(timer.elapsed().seconds(), {
          "query.name": query.name,
          "query.mode": query.mode,
        })

        // Postgres doesn't care about casing in most places, so we need to make our results agnostic as well...
        return {
          mode: ExecutionMode.Normal,
          duration: timer.elapsed(),
          rows: results.rows.map((r) => makeCaseInsensitive(r as T)),
        }
      } catch (err) {
        QueryMetrics.QueryErrors.add(1, {
          "query.name": query.name,
          "query.mode": query.mode,
        })
        console.log(err)
        error = err
      } finally {
        if (client) {
          client.release(error)
        }
      }

      throw new QueryError("failed to execute query")
    }

    throw new QueryError("Unsupported query type")
  }
}
