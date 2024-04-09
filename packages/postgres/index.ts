/**
 * Basic abstractions for Postgres
 */

import { vegasBuilder } from "@telefrek/core/backpressure/limits/algorithms.js"
import {
  createSimpleLimiter,
  type Limiter,
} from "@telefrek/core/backpressure/limits/index"
import {
  DefaultMultiLevelPriorityQueue,
  asTaskPriority,
  type MultiLevelPriorityQueue,
} from "@telefrek/core/structures/multiLevelQueue"
import { ExecutionMode, QueryParameters, type RowType } from "@telefrek/query"
import { Client, type QueryConfig, type QueryResult } from "pg"
import type { FrameworkPriority } from "../core"
import type { Pool } from "../core/structures/pool"
import { Duration } from "../core/time"

/**
 * Options provided when building a {@link PostgresDatabase}
 */
export interface PostgresDatabaseOptions {
  /** The {@link PostgresConnectionPool} to use for issuing queries */
  pool: Pool<Client>

  /** The default amount of time to wait for a task to complete (default is 1 second) */
  defaultTimeoutMilliseconds?: number
}

/**
 * Represents a database that can have queries submitted against it
 */
export interface PostgresDatabase {
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
  readonly #pool: Pool<Client>
  readonly #defaultTimeout: Duration
  readonly #queue: MultiLevelPriorityQueue
  readonly #limit: Limiter

  constructor(options: PostgresDatabaseOptions) {
    this.#pool = options.pool
    this.#defaultTimeout = Duration.fromMilli(
      options.defaultTimeoutMilliseconds ?? 1_000,
    )

    // TODO: make these potional
    this.#limit = createSimpleLimiter(vegasBuilder(2).withMax(48).build())

    // TODO: Change queue working size based on rate limiting
    this.#queue = new DefaultMultiLevelPriorityQueue(4)
  }

  submit<T extends RowType>(query: PostgresQuery): Promise<QueryResult<T>>
  submit<T extends RowType>(
    query: PostgresQuery,
    timeout: Duration,
  ): Promise<QueryResult<T>>
  submit<T extends RowType>(
    query: PostgresQuery,
    _timeout?: Duration,
  ): Promise<QueryResult<T>> {
    // TODO: Hook in the monitoring of pool errors
    return this.#queue.queue(
      {
        priority: asTaskPriority(query.priority ?? 5),
      },
      async (pool: Pool<Client>, q: PostgresQuery, timeout: Duration) => {
        const connection = await pool.get(timeout)
        try {
          return await connection.item.query<T>(q)
        } finally {
          connection.release()
        }
      },
      this.#pool,
      query,
      this.#defaultTimeout,
    )
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
