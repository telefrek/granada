import type {
  BaseColumnDefinition,
  ColumnDefinition,
  SQLType,
  ValidSQLTypes,
} from "../types"

export type SQLDatabase<Tables extends DatabaseTables> = {
  tables: Tables
  relations?: ForeignKey[]
}

export type DatabaseTables = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: SQLTableDefinition<any>
}

export interface SQLTableDefinition<Schema extends ColumnSchema> {
  columns: Schema
  key: PrimaryKey<Schema> | CompositePrimaryKey<Schema>
}

export type ColumnSchema = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: ColumnDefinition<any> | ColumnDefinition<any>[]
}

export interface PrimaryKey<Schema extends ColumnSchema> {
  column: keyof Schema
}

export interface CompositePrimaryKey<Schema extends ColumnSchema> {
  columns: (keyof Schema)[]
}

export interface ForeignKey {
  left: string
  right: string
  leftColumn: string
  rightColumn: string
}

export type SQLDatabaseSchema<Database extends SQLDatabase<DatabaseTables>> = {
  tables: {
    [key in keyof Database["tables"]]: Database["tables"][key] extends SQLTableDefinition<
      infer S
    >
      ? SQLTableSchema<SQLTableDefinition<S>["columns"]>
      : never
  }
}

type TableSchema<S extends ColumnSchema> = {
  [K in keyof S]: S[K] extends (infer U)[]
    ? U extends BaseColumnDefinition<ValidSQLTypes>
      ? SQLType<U["type"]>[]
      : never
    : S[K] extends BaseColumnDefinition<ValidSQLTypes>
      ? SQLType<S[K]["type"]>
      : never
}

export type SQLTableSchema<S extends ColumnSchema> = TableSchema<S>
