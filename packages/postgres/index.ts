/**
 * Basic abstractions for Postgres
 */

import { ExecutionMode, QueryParameters } from "@telefrek/query"
import type { QueryConfig } from "pg"

export type QueryMaterializer = (parameters: QueryParameters) => {
  text: string
  values?: unknown[]
}

export interface PostgresQuery<R extends unknown[] = never>
  extends QueryConfig<R> {
  mode: ExecutionMode
  name: string
  materializer?: QueryMaterializer
}

export interface PostgresStreamingQuery<R extends unknown[] = never>
  extends PostgresQuery<R> {
  mode: ExecutionMode.Streaming
}

export function isPostgresQuery(query: unknown): query is PostgresQuery {
  return (
    typeof query === "object" &&
    query !== null &&
    "mode" in query &&
    typeof query.mode === "string" &&
    Object.values(ExecutionMode).includes(query.mode as ExecutionMode)
  )
}
