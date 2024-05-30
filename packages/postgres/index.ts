/**
 * Basic abstractions for Postgres
 */

import { ValueType } from "@opentelemetry/api"
import { vegasBuilder } from "@telefrek/core/backpressure/algorithms.js"
import {
  createSimpleLimiter,
  type Limiter,
} from "@telefrek/core/backpressure/limits.js"
import {
  DeferredPromise,
  type FrameworkPriority,
  type MaybeAwaitable,
} from "@telefrek/core/index.js"
import { debug, error, info } from "@telefrek/core/logging.js"
import { getGranadaMeter } from "@telefrek/core/observability/metrics.js"
import { trace } from "@telefrek/core/observability/tracing.js"
import {
  DefaultMultiLevelPriorityQueue,
  asTaskPriority,
  createQueueWorker,
  type MultiLevelPriorityQueue,
} from "@telefrek/core/structures/multiLevelQueue.js"
import type { Pool } from "@telefrek/core/structures/pool.js"
import { Duration, Timer } from "@telefrek/core/time.js"
import { makeCaseInsensitive } from "@telefrek/core/type/proxies.js"
import type { Optional } from "@telefrek/core/type/utils.js"
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

/**
 * Options provided when building a {@link PostgresDatabase}
 */
export interface PostgresDatabaseOptions {
  /** The {@link PostgresConnectionPool} to use for issuing queries */
  pool: Pool<Client>

  /** The default amount of time to wait for a task to complete (default is 1 second) */
  defaultTimeoutMilliseconds?: number

  /** The maximum parallel calls to execute (default is 4)*/
  maxParallelism?: number
}

const PostgresQueryMetrics = {
  QueryExecutionDuration: getGranadaMeter().createHistogram(
    "query_execution_time",
    {
      description: "The amount of time the query took to execute",
      unit: "seconds",
      valueType: ValueType.DOUBLE,
      advice: {
        explicitBucketBoundaries: [
          0.0005, 0.001, 0.0025, 0.005, 0.01, 0.015, 0.02, 0.05, 0.1, 0.5,
        ],
      },
    },
  ),
  QueryErrors: getGranadaMeter().createCounter("query_error", {
    description:
      "The number of errors that have been encountered for the query",
    valueType: ValueType.INT,
  }),
} as const

/**
 * Represents a database that can have queries submitted against it
 */
export interface PostgresDatabase extends QueryExecutor {
  /**
   * Close the database and release connections
   */
  close(): MaybeAwaitable<void>

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
  readonly _controller: AbortController = new AbortController()
  readonly _workers: Promise<void>[] = []

  constructor(options: PostgresDatabaseOptions) {
    this._pool = options.pool
    this._defaultTimeout = Duration.ofMilli(
      options.defaultTimeoutMilliseconds ?? 1_000,
    )

    // TODO: make these optional
    this._limit = createSimpleLimiter(vegasBuilder(2).withMax(48).build())

    // TODO: Change queue working size based on rate limiting
    this._queue = new DefaultMultiLevelPriorityQueue()

    // Add some workers
    for (let n = 0; n < 4; ++n) {
      this._workers.push(
        createQueueWorker(this._queue, this._controller.signal),
      )
    }
  }

  async close(): Promise<void> {
    info(`Postgres: Shutting down queue`)
    // Stop the queue
    await this._queue.shutdown()

    // Abort the controller to stop the workers
    this._controller.abort("shutting down")
    await Promise.all(this._workers)

    info(`Postgres: Shutting down pool`)
    // Stop the pool
    await this._pool.shutdown()

    info(`Postgres: Shutdown complete`)
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
    timeout?: Duration,
  ): Promise<QueryResult<T>> {
    // TODO: Hook in the monitoring of pool errors
    const deferred = new DeferredPromise<QueryResult<T>>()

    const execute = this.executeQuery.bind(this)
    const pool = this._pool
    const queryTimeout = timeout ?? this._defaultTimeout

    // Queue the work...
    this._queue.queue(
      {
        priority: asTaskPriority(query.priority ?? 5),
        timeout: queryTimeout,
        cancel: () => deferred.reject(new QueryError("timeout")),
      },
      async () => {
        try {
          deferred.resolve(await execute(query, pool, queryTimeout))
        } catch (err) {
          error(`Rejecting... ${err}`)
          deferred.reject(err)
        }
      },
    )

    return deferred
  }

  @trace((query: PostgresQuery) => query.name)
  private async executeQuery<T extends RowType>(
    query: PostgresQuery,
    pool: Pool<Client>,
    timeout: Duration,
  ): Promise<QueryResult<T>> {
    const timer = Timer.startNew()
    debug(`Executing ${query.name}, getting connection...`)
    const connection = await pool.get(timeout)

    let error: Optional<unknown>
    try {
      // TODO: Update for cursors...
      // TODO: How do we want to deal with "named queries..." as well as
      // tracking duplicates
      debug(`Sending query to downstream`)
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
