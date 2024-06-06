/* eslint-disable @typescript-eslint/ban-types */
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
import { type SQLDatabaseSchema, type SQLTableSchema } from "./schema.js"
import type { Flatten, Invalid } from "./utils.js"

export type ValidateQueryString<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends string,
> = ValidateQuery<Schema, ParseSQLQuery<Query>>

export type ValidateQuery<
  Schema extends SQLDatabaseSchema<any, any>,
  Query extends SQLQuery<any>,
> = AddProjections<ExtractProjections<SplitTables<Query>>, Schema>

type AddProjection<
  P extends ProjectedQuery<any>,
  S extends SQLDatabaseSchema<any, any>,
> =
  S extends SQLDatabaseSchema<infer TableSchema, infer Relations>
    ? P extends ProjectedQuery<infer Table, infer _Columns, infer Reference>
      ? Reference["table"] extends keyof TableSchema
        ? SQLDatabaseSchema<
            Flatten<TableSchema & { [key in Table]: SQLTableSchema<{}> }>,
            Relations
          >
        : Invalid<`${Reference["table"]} does not exist in schema`>
      : never
    : never

type AddProjections<T, S extends SQLDatabaseSchema<any, any>> = T extends [
  infer Projection,
  ...infer Rest,
]
  ? Rest extends never[]
    ? Projection extends ProjectedQuery<any, any>
      ? AddProjection<Projection, S>
      : Projection
    : Projection extends ProjectedQuery<any>
      ? AddProjection<Projection, S> extends SQLDatabaseSchema<any, any>
        ? AddProjections<Rest, AddProjection<Projection, S>>
        : AddProjection<Projection, S>
      : Projection
  : "3"

type ColumnInfo<
  Column extends string = string,
  Alias extends string = Column,
> = {
  column: Column
  alias: Alias
}

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
