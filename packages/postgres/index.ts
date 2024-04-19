/**
 * Basic abstractions for Postgres
 */

import { vegasBuilder } from "@telefrek/core/backpressure/algorithms.js"
import {
    createSimpleLimiter,
    type Limiter,
} from "@telefrek/core/backpressure/limits.js"
import type { FrameworkPriority } from "@telefrek/core/index.js"
import {
    DefaultMultiLevelPriorityQueue,
    asTaskPriority,
    type MultiLevelPriorityQueue,
} from "@telefrek/core/structures/multiLevelQueue.js"
import type { Pool } from "@telefrek/core/structures/pool.js"
import { Duration, Timer } from "@telefrek/core/time.js"
import { makeCaseInsensitive } from "@telefrek/core/type/proxies.js"
import type { Optional } from "@telefrek/core/type/utils"
import { QueryError } from "@telefrek/query/error.js"
import {
    ExecutionMode,
    QueryParameters,
    type BoundQuery,
    type QueryExecutor,
    type QueryResult,
    type RowType,
    type SimpleQuery,
} from "@telefrek/query/index.js"
import { Client, type QueryConfig } from "pg"
import { getGranadaMeter } from ()
} from "@telefrek/core/observability/metrics.js"

/**
 * Options provided when building a {@link PostgresDatabase}
 */
export interface PostgresDatabaseOptions {
  /** The {@link PostgresConnectionPool} to use for issuing queries */
  pool: Pool<Client>

  /** The default amount of time to wait for a task to complete (default is 1 second) */
  defaultTimeoutMilliseconds?: number
}

const PostgresQueryMetrics = {
  QueryExecutionDuration: getGranadaMeter().createHistogram(
    "query_execution_time",
    {
      description: "The amount of time the query took to execute",
    },
  ),
  QueryErrors: getGranadaMeter().createCounter("query_error", {
    description:
      "The number of errors that have been encountered for the query",
  }),
} as const
/**
 * Represents a database that can have queries submitted against it
 */
export interface PostgresDatabase extends QueryExecutor {
  /**
   * Submits a query for execution
   *
   * @param query The {@link PostgresQuery} to submit
   */
  submit<T extends RowType>(query: PostgresQuery): Promise<QueryResult<T>>

  /**
   * Submits a query for execution
   *
   * @param query The {@link PostgresQuery} to submit
   * @param timeout The maximum {@link Duration} of time to wait for execution
   * to start before abandoning the query
   */
  submit<T extends RowType>(
    query: PostgresQuery,
    timeout: Duration,
  ): Promise<QueryResult<T>>
}

export class DefaultPostgresDatabase implements PostgresDatabase {
  readonly _pool: Pool<Client>
  readonly _defaultTimeout: Duration
  readonly _queue: MultiLevelPriorityQueue
  readonly _limit: Limiter

  constructor(options: PostgresDatabaseOptions) {
    this._pool = options.pool
    this._defaultTimeout = Duration.fromMilli(
      options.defaultTimeoutMilliseconds ?? 1_000,
    )

    // TODO: make these potional
    this._limit = createSimpleLimiter(vegasBuilder(2).withMax(48).build())

    // TODO: Change queue working size based on rate limiting
    this._queue = new DefaultMultiLevelPriorityQueue(4)
  }

  run<T extends RowType, P extends QueryParameters>(
    query: SimpleQuery<T> | BoundQuery<T, P>,
  ): Promise<QueryResult<T>> {
    if (isPostgresQuery(query)) {
      return this.submit(query)
    }

    throw new QueryError("Invalid query submitted for postgres")
  }

  submit<T extends RowType>(query: PostgresQuery): Promise<QueryResult<T>>
  submit<T extends RowType>(
    query: PostgresQuery,
    timeout: Duration,
  ): Promise<QueryResult<T>>
  async submit<T extends RowType>(
    query: PostgresQuery,
    _timeout?: Duration,
  ): Promise<QueryResult<T>> {
    // TODO: Hook in the monitoring of pool errors
    const result = await this._queue.queue(
      {
        priority: asTaskPriority(query.priority ?? 5),
      },
      executeQuery<T>,
      query,
      this._pool,
      this._defaultTimeout,
    )

    return result
  }
}

async function executeQuery<T extends RowType>(
  query: PostgresQuery,
  pool: Pool<Client>,
  timeout: Duration,
): Promise<QueryResult<T>> {
  const timer = Timer.startNew()
  const connection = await pool.get(timeout)

  let error: Optional<unknown>
  try {
    // TODO: Update for cursors...
    // TODO: How do we want to deal with "named queries..." as well as
    // tracking duplicates
    const results = await connection.item.query({
      ...query,
      name: undefined,
    })

    const duration = timer.stop()

    PostgresQueryMetrics.QueryExecutionDuration.record(duration.seconds(), {
      "query.name": query.name,
      "query.mode": query.mode,
    })
    // Update algorithm...

    // Postgres doesn't care about casing in most places, so we need to
    // make our results agnostic as well...
    if (query.mode === ExecutionMode.Normal) {
      return {
        mode: query.mode,
        duration: duration,
        rows: results.rows.map((r) => makeCaseInsensitive(r as T)),
      }
    }

    throw new QueryError("unsupported mode")
  } catch (err) {
    PostgresQueryMetrics.QueryErrors.add(1, {
      "query.name": query.name,
      "query.mode": query.mode,
    })

    error = err
    throw err
  } finally {
    connection.release(error)
  }
}

/**
 * Method to transform {@link QueryParameters} into a text and values format
 * used by `pg`
 */
export type QueryMaterializer = (parameters: QueryParameters) => {
  text: string
  values?: unknown[]
}

export interface PostgresQuery<R extends unknown[] = never>
  extends QueryConfig<R> {
  /** The query {@link ExecutionMode} */
  mode: ExecutionMode
  /** The name for the query */
  name: string
  /** A materializer that can transform parameters into a query */
  materializer?: QueryMaterializer
  /** The {@link FrameworkPriority} for the query to execute with */
  priority?: FrameworkPriority
}

/**
 *
 * @param query The object to evaluate
 * @returns True of the query is a {@link PostgresQuery}
 */
export function isPostgresQuery(query: unknown): query is PostgresQuery {
  return (
    typeof query === "object" &&
    query !== null &&
    "name" in query &&
    typeof query.name === "string" &&
    "text" in query &&
    typeof query.text === "string" &&
    "mode" in query &&
    typeof query.mode === "string" &&
    Object.values(ExecutionMode).includes(query.mode as ExecutionMode)
  )
}
