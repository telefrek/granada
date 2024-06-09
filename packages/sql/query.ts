/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Queries that are bound to SQL syntax and can be applied to a source
 */

import type { SQLQuery } from "./ast.js"
import type { ParseSQLQuery } from "./parser.js"
import type { SQLDatabaseSchema } from "./schema.js"
import type {
  QueryValidationResult,
  ValidateQueryString,
  ValidateSchema,
  VerifyQuery,
} from "./validation.js"

/**
 * Query bound to the final schema
 */
type SchemaBoundQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> = {
  schema: Schema
  query: Query
}

/**
 * Intermediate transform stage for creating a query from a schema and string/SQLQuery
 */
type BoundQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  ValidateSchema<Schema, Query> extends SQLDatabaseSchema<
    infer TableSchema,
    infer Relations
  >
    ? SchemaBoundQuery<SQLDatabaseSchema<TableSchema, Relations>, Query>
    : ValidateSchema<Schema, Query>

type BoundQueryType<
  S extends string,
  Schema extends SQLDatabaseSchema<any, any>,
> =
  BoundQuery<Schema, ParseSQLQuery<S>> extends SchemaBoundQuery<
    infer ValidSchema,
    infer Q
  >
    ? VerifyQuery<ValidSchema, Q> extends QueryValidationResult<
        infer R,
        infer _P
      >
      ? Query<S, R, []>
      : VerifyQuery<ValidSchema, Q>
    : never

export function createBuilder<S extends SQLDatabaseSchema<any, any>>() {
  return <T extends string, P extends unknown[] = []>(
    q: ValidateQueryString<S, T>,
  ): BoundQueryType<T, S> => {
    return {
      queryString: q,
      execute(..._args: P) {
        throw new Error("not implemented")
      },
    } as any
  }
}

export interface Query<
  QueryString extends string = string,
  ReturnType extends object | number = object,
  Parameters extends unknown[] = never,
> {
  /**
   * The underlying query
   */
  readonly queryString: QueryString

  execute(...args: Parameters): Promise<ReturnType[]>
}
