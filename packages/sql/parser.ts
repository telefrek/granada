/**
 * Set of utilities to validate a query against a schema
 */

import { queryBuilder, type QueryBuilder } from "./builder.js"
import type { NormalizeQuery } from "./parsing/normalization.js"
import type { ParseSQL } from "./parsing/queries.js"
import type { SQLDatabaseSchema } from "./schema.js"

/**
 * Things to do
 *
 * - Fix where clause id=1 parsing, etc
 * - Add more tests for structure
 * - Verify columns on select
 * - Parse insert/update/delete
 * - Add aggregation methods to columns
 * - Add in unions, etc
 */

/**
 * Parse a SQLQuery type from the given query string
 */
export type ParseSQLQuery<Query extends string> = ParseSQL<
  NormalizeQuery<Query>
>

/**
 * Class to help with Query parsing
 */
export class QueryParser<Database extends SQLDatabaseSchema> {
  private _database: Database

  constructor(database: Database) {
    this._database = database
  }

  get builder(): QueryBuilder<Database> {
    return queryBuilder(this._database)
  }

  parse<T extends string>(query: T): ParseSQLQuery<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return query as any
  }
}
