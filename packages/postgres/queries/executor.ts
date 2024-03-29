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
import { getDebugInfo } from "../../core/index"
import { isPostgresQuery } from "./builder"

pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) =>
  v ? BigInt(v) : null,
)
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v ? BigInt(v) : null))

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

      let queryText: string | undefined
      let parameters: unknown[] | undefined

      if (query.context.materializer === "static") {
        queryText = query.context.queryString

        const mapping = query.context.parameterMapping
        if (query.queryType === QueryType.BOUND) {
          parameters = Array.from(query.context.parameterMapping.keys())
            .sort((a, b) => mapping.get(a)! - mapping.get(b)!)
            .map((k) => query.parameters[k])
        }
      } else {
        const dynamic = query.context.queryMaterializer(
          query.queryType === QueryType.BOUND ? query.parameters : {},
        )
        queryText = dynamic[0]
        parameters = dynamic[1]
      }

      try {
        const results = await this.#client.query(queryText!, parameters)

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

    console.log(getDebugInfo(query))

    throw new QueryError("Unsupported query type")
  }
}
