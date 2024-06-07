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
  type SQLColumnSchema,
  type SQLDatabaseSchema,
  type SQLTableSchema,
} from "./schema.js"
import type { Flatten, Invalid } from "./utils.js"

export type ValidateQueryString<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends string,
> =
  _IsValidQuery<Schema, ParseSQLQuery<Query>> extends true
    ? Query
    : _IsValidQuery<Schema, ParseSQLQuery<Query>>

export type ValidateQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> =
  _IsValidQuery<Schema, Query> extends true
    ? Query
    : _IsValidQuery<Schema, Query>

export type VerifySchema<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> = AddProjections<ExtractProjections<SplitTables<Query>>, Schema>

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

type AddProjections<T, S extends SQLDatabaseSchema<any, any>> = T extends [
  infer Projection,
  ...infer Rest,
]
  ? Rest extends never[]
    ? Projection extends ProjectedQuery<any, any>
      ? AddProjection<Projection, S>
      : Invalid<"Invalid projection, corrupted query syntax">
    : Projection extends ProjectedQuery<any>
      ? AddProjection<Projection, S> extends SQLDatabaseSchema<any, any>
        ? AddProjections<Rest, AddProjection<Projection, S>>
        : AddProjection<Projection, S>
      : Invalid<"Invalid projection, corrupted query syntax">
  : T extends never[]
    ? S
    : Invalid<"Corrupted table scan">

type AddProjection<
  P extends ProjectedQuery<any>,
  S extends SQLDatabaseSchema<any, any>,
> =
  S extends SQLDatabaseSchema<infer TableSchema, infer Relations>
    ? P extends ProjectedQuery<infer Table, infer Columns, infer Reference>
      ? Reference["table"] extends keyof TableSchema
        ? TableSchema[Reference["table"]] extends SQLTableSchema<
            infer ColumnSchema
          >
          ? CheckTable<Reference["table"], Columns, ColumnSchema> extends true
            ? SQLDatabaseSchema<
                Flatten<
                  TableSchema & {
                    [key in Table]: SQLTableSchema<
                      ExtractProjectionSchema<Columns, ColumnSchema>
                    >
                  }
                >,
                Relations
              >
            : CheckTable<Reference["table"], Columns, ColumnSchema>
          : Invalid<`${Reference["table"]} has an invalid column schema...`>
        : Invalid<`${Reference["table"]} does not exist in schema`>
      : never
    : never

type ColumnInfo<
  Column extends string = string,
  Alias extends string = Column,
> = {
  column: Column
  alias: Alias
}

type ExtractProjectionSchema<
  Columns,
  Schema extends SQLColumnSchema,
> = Columns extends "*"
  ? Schema
  : Columns extends [infer Column, ...infer Rest]
    ? Rest extends never[]
      ? Column extends ColumnInfo<infer Name, infer Alias>
        ? { [key in Alias]: Schema[Name] }
        : never
      : Column extends ColumnInfo<infer Name, infer Alias>
        ? Flatten<
            { [key in Alias]: Schema[Name] } & ExtractProjectionSchema<
              Rest,
              Schema
            >
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
      ? Info extends ColumnInfo<infer Column, infer _>
        ? Column extends keyof Schema
          ? true
          : Invalid<`${Column} doesn't exist in ${Table}`>
        : Invalid<`Invalid column info on last`>
      : Info extends ColumnInfo<infer Column, infer _>
        ? Column extends keyof Schema
          ? CheckTable<Table, Rest, Schema>
          : Invalid<`${Column} doesn't exist in ${Table}`>
        : Invalid<`Invalid column info on last`>
    : Invalid<"Invalid input for Columns">

type TableQuery<
  Table extends string = string,
  Columns extends ColumnInfo[] | "*" = ColumnInfo[],
> = {
  type: "Table"
  table: Table
  columns: Columns
}

type ProjectedQuery<
  Table extends string = string,
  Columns extends ColumnInfo[] | "*" = ColumnInfo[],
  Reference extends ProjectedQuery<any> | TableQuery<any> = TableQuery<any>,
> = {
  type: "Projection"
  table: Table
  columns: Columns
  reference: Reference
}

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
  : T extends ColumnInfo[]
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
  Q extends SelectClause<infer Columns, infer _>
    ? ExtractColumnNames<Columns>
    : Q extends ReturningClause<infer Returning>
      ? ExtractColumnNames<Returning>
      : []

type ExtractColumnNames<T> = T extends "*"
  ? ["*"]
  : T extends [infer Column, ...infer Rest]
    ? Rest extends never[]
      ? Column extends ColumnReference<infer Reference, infer Alias>
        ? [ColumnInfo<Reference["column"], Alias>]
        : Column extends TableColumnReference<infer _, infer Name>
          ? [ColumnInfo<Name>]
          : never
      : Column extends ColumnReference<infer Reference, infer Alias>
        ? [ColumnInfo<Reference["column"], Alias>, ...ExtractColumnNames<Rest>]
        : Column extends TableColumnReference<infer _, infer Name>
          ? [ColumnInfo<Name>, ...ExtractColumnNames<Rest>]
          : never
    : never
