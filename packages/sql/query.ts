/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Queries that are bound to SQL syntax and can be applied to a source
 */

import type { Flatten } from "@telefrek/type-utils/index.js"
import type { SQLQuery } from "./ast.js"
import type { ParseSQLQuery } from "./parser.js"
import type {
  FindQueryParameters,
  ParameterInfo,
} from "./parsing/queryParameters.js"
import {
  type SQLColumnSchema,
  type SQLDatabaseSchema,
  type SQLRowEntity,
} from "./schema.js"
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
      ? BuildParameters<Q, Schema> extends SQLColumnSchema
        ? Query<S, R, SQLRowEntity<BuildParameters<Q, Schema>>>
        : Query<S, R>
      : VerifyQuery<ValidSchema, Q>
    : never

type BuildParameters<
  Q extends SQLQuery<any>,
  Schema extends SQLDatabaseSchema<any, any>,
> =
  FindQueryParameters<Q> extends [infer P, ...infer Rest]
    ? Rest extends never[]
      ? P extends ParameterInfo<infer Name, infer Column, infer Table>
        ? { [key in Name]: Schema["tables"][Table]["columns"][Column] }
        : object
      : P extends ParameterInfo<infer Name, infer Column, infer Table>
        ? Flatten<
            {
              [key in Name]: Schema["tables"][Table]["columns"][Column]
            } & MapParameters<Rest, Schema>
          >
        : object
    : object

type MapParameters<T, Schema extends SQLDatabaseSchema<any, any>> = T extends [
  infer P,
  ...infer Rest,
]
  ? Rest extends never[]
    ? P extends ParameterInfo<infer Name, infer Column, infer Table>
      ? { [key in Name]: Schema["tables"][Table]["columns"][Column] }
      : object
    : object
  : object

export function createBuilder<S extends SQLDatabaseSchema<any, any>>() {
  return <T extends string>(
    q: ValidateQueryString<S, T>,
  ): BoundQueryType<T, S> => {
    return {
      queryString: q,
      execute(..._args: any[]): Promise<unknown> {
        return Promise.reject(new Error("not implemented"))
      },
    } as any
  }
}

export interface Query<
  QueryString extends string = string,
  ReturnType extends object | number = object,
  Parameters extends object = never,
> {
  /**
   * The underlying query
   */
  readonly queryString: QueryString

  execute: ExecuteMethod<ReturnType, Parameters>
}

type ExecuteMethod<
  ReturnType extends object | number,
  Parameters extends object,
> = [Parameters] extends [never]
  ? () => Promise<ReturnType>
  : Parameters extends []
    ? (...args: Parameters) => Promise<ReturnType>
    : (parameters: Parameters) => Promise<ReturnType>
