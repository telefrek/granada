/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Validation should parse a query against a schema and validate the objects
 */

import type {
  ColumnReference,
  DeleteClause,
  InsertClause,
  NamedQuery,
  QueryClause,
  ReturningClause,
  SQLQuery,
  SelectClause,
  TableColumnReference,
  UpdateClause,
  WithClause,
} from "./ast.js"
import type { ParseSQLQuery } from "./parser.js"
import {
  type ColumnTypeDefinition,
  type SQLColumnSchema,
  type SQLDatabaseSchema,
  type SQLDatabaseTables,
  type SQLTableEntity,
  type SQLTableSchema,
} from "./schema.js"
import type { Flatten, Invalid } from "./utils.js"

/**
 * Validate the query string against the schema
 */
export type ValidateQueryString<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends string,
> =
  _IsValidQuery<Schema, ParseSQLQuery<Query>> extends true
    ? Query
    : _IsValidQuery<Schema, ParseSQLQuery<Query>>

/**
 * Validate the parsed query against the schema
 */
export type ValidateQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  _IsValidQuery<Schema, Query> extends true
    ? Query
    : _IsValidQuery<Schema, Query>

/**
 * Verify the query against the schema and ensure no structural issues,
 * returning the validated schema to use
 */
export type ValidateSchema<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  AddProjections<
    ExtractProjections<SplitTables<Query>>,
    Schema
  > extends SQLDatabaseSchema<infer TableSchema, infer References>
    ? SQLDatabaseSchema<TableSchema, References>
    : AddProjections<ExtractProjections<SplitTables<Query>>, Schema>

/**
 * Verify the query itself and determine the resulting type/parameters
 */
export type VerifyQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  ExtractReturnType<Schema, Query> extends { [key: string]: any } // TODO: handle parameters too
    ? QueryValidationResult<ExtractReturnType<Schema, Query>, object>
    : ExtractReturnType<Schema, Query>

/**
 * Get the return type information for the query and parameters required to run it
 */
export type QueryValidationResult<
  ReturnType extends object | number = number,
  Parameters extends object = object,
> = {
  returns: ReturnType
  parameters: Parameters
}

type ExtractReturnType<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  Query extends SQLQuery<infer Q>
    ? Q extends QueryClause
      ? Q extends SelectClause<any, any>
        ? ExtractSelectReturnType<Schema, Q>
        : Invalid<`Unsupported query type`>
      : Invalid<`Cannot extract return from non QueryClause`>
    : Invalid<`Query is not a SQLQuery`>

type ExtractSelectReturnType<
  Schema extends SQLDatabaseSchema<any, any>,
  Select extends SelectClause<any>,
> =
  Select extends SelectClause<infer Columns, infer From>
    ? Schema extends SQLDatabaseSchema<infer TableSchema, infer _>
      ? From["alias"] extends keyof TableSchema // TODO: joins much? lol
        ? ExtractReturnColumns<Columns, From["alias"], TableSchema> extends {
            [key: string]: ColumnTypeDefinition<any>
          }
          ? SQLTableEntity<{
              columns: ExtractReturnColumns<Columns, From["alias"], TableSchema>
            }>
          : ExtractReturnColumns<Columns, From["alias"], TableSchema>
        : Invalid<`${From["alias"]} is not a valid table in the schema`>
      : Invalid<`Corrupted database schema`>
    : Invalid<`Corrupted select clause`>

type ExtractReturnColumns<
  Columns,
  Table extends string,
  Schema extends SQLDatabaseTables,
> = Columns extends [infer Column, ...infer Rest]
  ? Rest extends never[]
    ? Column extends ColumnReference<infer Reference, infer Alias>
      ? Reference["column"] extends keyof Schema[Table]["columns"]
        ? { [key in Alias]: Schema[Table]["columns"][Reference["column"]] } // TODO: Handle table references, this assumes un-named
        : Invalid<`${Reference["column"]} is not a valid column in ${Table}`>
      : Invalid<`Column is not a valid reference`>
    : Column extends ColumnReference<infer Reference, infer Alias>
      ? Reference["column"] extends keyof Schema[Table]["columns"]
        ? Flatten<
            {
              [key in Alias]: Schema[Table]["columns"][Reference["column"]]
            } & ExtractReturnColumns<Rest, Table, Schema>
          > // TODO: Handle table references, this assumes un-named
        : Invalid<`${Reference["column"]} is not a valid column in ${Table}`>
      : Invalid<`Column is not a valid reference`>
  : Invalid<`Invalid column types in return type building`>

// type ExtractParameters<
//   _Schema extends SQLDatabaseSchema<any, any>,
//   _Query extends SQLQuery<any>,
// > = object

/**
 * We need to do a couple things to make this work.
 *
 * 1. Augment the schema with any projections
 * 2. Verify the projections are accessed at the right level (IF we do this
 *    procedurally by first checking high level and then digging further down
 *    it's a bit easier but some things like JOINS will still be..suspect, need
 *    a way to "scope" projections)
 * 3. Ensure columns aren't accessed on tables (real or projected) that don't exist
 * 4. Verify the values used for any filtering match the column types (might be
 *    more fun if we don't get projection chaining correct...)
 * 5. Verify parameters don't collide or mix
 * 6. Extract the parameter types for anything required to run the query
 * 7. Get the return type (returning queries are fun!)
 * 8. All the other actual SQL syntax that we in theory should enforce but is
 *    kinda difficult to do with the type system lol...
 */

type _IsValidQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  AddProjections<
    ExtractProjections<SplitTables<Query>>,
    Schema
  > extends SQLDatabaseSchema<infer _TableSchema, infer _References>
    ? true
    : AddProjections<ExtractProjections<SplitTables<Query>>, Schema>

/**
 * Add all the projections that we find in the query
 */
type AddProjections<
  Projections,
  Schema extends SQLDatabaseSchema<any, any>,
> = Projections extends [infer Projection, ...infer Rest]
  ? Rest extends never[]
    ? Projection extends ProjectedQuery<any, any>
      ? AddProjection<Projection, Schema>
      : Invalid<"Invalid projection, corrupted query syntax">
    : Projection extends ProjectedQuery<any>
      ? AddProjection<Projection, Schema> extends SQLDatabaseSchema<any, any>
        ? AddProjections<Rest, AddProjection<Projection, Schema>>
        : AddProjection<Projection, Schema>
      : Invalid<"Invalid projection, corrupted query syntax">
  : Projections extends never[]
    ? Schema
    : Invalid<"Corrupted table scan">

/**
 * Add the projection to the schema
 */
type AddProjection<
  Projection extends ProjectedQuery<any>,
  Schema extends SQLDatabaseSchema<any, any>,
> =
  Schema extends SQLDatabaseSchema<infer TableSchema, infer Relations>
    ? Projection extends ProjectedQuery<
        infer Table,
        infer Columns,
        infer Reference
      >
      ? Reference["table"] extends keyof TableSchema
        ? TableSchema[Reference["table"]] extends SQLTableSchema<
            infer ColumnSchema
          >
          ? CheckTable<Reference["table"], Columns, ColumnSchema> extends true
            ? ExtractProjectionSchema<
                Columns,
                Reference["table"],
                TableSchema
              > extends SQLColumnSchema
              ? SQLDatabaseSchema<
                  Flatten<
                    TableSchema & {
                      [key in Table]: SQLTableSchema<
                        ExtractProjectionSchema<
                          Columns,
                          Reference["table"],
                          TableSchema
                        >
                      >
                    }
                  >,
                  Relations
                >
              : Columns //Invalid<`${Reference["table"]} resulted in an invalid column schema`>
            : CheckTable<Reference["table"], Columns, ColumnSchema>
          : Invalid<`${Reference["table"]} has an invalid column schema...`>
        : Invalid<`${Reference["table"]} does not exist in schema`>
      : never
    : never

/**
 * The column source information
 */
type ColumnSourceInfo<
  Table extends string = string,
  Column extends string = string,
  Alias extends string = Column,
> = {
  table: Table
  column: Column
  alias: Alias
}

/**
 * Get the schema for the projection based on the columns pulled
 */
type ExtractProjectionSchema<
  Columns,
  Table extends string,
  Schema extends SQLDatabaseTables,
> = Columns extends "*"
  ? Schema
  : Columns extends [infer Column, ...infer Rest]
    ? Rest extends never[]
      ? Column extends ColumnSourceInfo<infer _Tbl, infer Name, infer Alias>
        ? { [key in Alias]: Schema[Table]["columns"][Name] }
        : never
      : Column extends ColumnSourceInfo<infer _Tbl, infer Name, infer Alias>
        ? Flatten<
            {
              [key in Alias]: Schema[Table]["columns"][Name]
            } & ExtractProjectionSchema<Rest, Table, Schema>
          >
        : never
    : never

type CheckTable<
  Table extends string,
  Columns,
  Schema extends SQLColumnSchema,
> = Columns extends "*"
  ? true
  : Columns extends [infer Info, ...infer Rest]
    ? Rest extends never[]
      ? Info extends ColumnSourceInfo<infer _T, infer Column, infer _>
        ? Column extends keyof Schema
          ? true
          : Invalid<`${Column} doesn't exist in ${Table}`>
        : Invalid<`Invalid column info on last`>
      : Info extends ColumnSourceInfo<infer _T, infer Column, infer _>
        ? Column extends keyof Schema
          ? CheckTable<Table, Rest, Schema>
          : Invalid<`${Column} doesn't exist in ${Table}`>
        : Invalid<`Invalid column info on last`>
    : Invalid<"Invalid input for Columns">

type TableQuery<
  Table extends string = string,
  Columns extends ColumnSourceInfo[] | "*" = ColumnSourceInfo[],
> = {
  type: "Table"
  table: Table
  columns: Columns
}

type ProjectedQuery<
  Table extends string = string,
  Columns extends ColumnSourceInfo[] | "*" = ColumnSourceInfo[],
  Reference extends ProjectedQuery<any> | TableQuery<any> = TableQuery<any>,
> = {
  type: "Projection"
  table: Table
  columns: Columns
  reference: Reference
}

// TODO: Probably need to explore nested as well...
type ExtractProjections<T> = T extends [infer Query, ...infer Rest]
  ? Rest extends never[]
    ? Query extends NamedQuery<infer Q, infer Alias>
      ? [ExtractProjection<NamedQuery<Q, Alias>>]
      : Query extends QueryClause
        ? []
        : never
    : Query extends NamedQuery<infer Name, infer Alias>
      ? [
          ExtractProjection<NamedQuery<Name, Alias>>,
          ...ExtractProjections<Rest>,
        ]
      : Query extends QueryClause
        ? []
        : never
  : never

type SplitTables<Query extends SQLQuery<any>> =
  Query extends WithClause<infer With>
    ? [...WithClause<With>["with"], Query["query"]]
    : [Query["query"]]

type ExtractProjection<Query extends NamedQuery<any>> =
  Query extends NamedQuery<infer Q, infer Alias>
    ? ProjectedQuery<
        Alias,
        CheckColumnInfo<ExtractColumns<Q["query"]>>,
        TableQuery<ExtractTableReference<Q["query"]>["alias"], []>
      >
    : never

type CheckColumnInfo<T> = T extends ["*"]
  ? "*"
  : T extends ColumnSourceInfo[]
    ? T
    : never

type ExtractTableReference<Q extends QueryClause> =
  Q extends SelectClause<infer _, infer From>
    ? From
    : Q extends UpdateClause<infer From, infer _>
      ? From
      : Q extends InsertClause<infer From, infer _C, infer _V>
        ? From
        : Q extends DeleteClause<infer From>
          ? From
          : never

type ExtractColumns<Q extends QueryClause> =
  Q extends SelectClause<infer Columns, infer From>
    ? ExtractColumnNames<Columns, From["alias"]>
    : Q extends ReturningClause<infer Returning>
      ? ExtractColumnNames<Returning>
      : []

// TODO: Broken for column reference without table names...
type ExtractColumnNames<T, Table extends string = string> = T extends "*"
  ? ["*"]
  : T extends [infer Column, ...infer Rest]
    ? Rest extends never[]
      ? Column extends ColumnReference<infer Reference, infer Alias>
        ? [ColumnSourceInfo<Table, Reference["column"], Alias>]
        : Column extends TableColumnReference<infer _, infer Name>
          ? [ColumnSourceInfo<Table, Name>]
          : never
      : Column extends ColumnReference<infer Reference, infer Alias>
        ? [
            ColumnSourceInfo<Table, Reference["column"], Alias>,
            ...ExtractColumnNames<Rest>,
          ]
        : Column extends TableColumnReference<infer _, infer Name>
          ? [ColumnSourceInfo<Table, Name>, ...ExtractColumnNames<Rest>]
          : never
    : never
