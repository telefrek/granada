import type { ColumnType, SimpleColumnDefinition } from "../types"

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
  [key: string]: SimpleColumnDefinition<any>
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

type NullableKeys<S extends ColumnSchema> = {
  [K in keyof S]: undefined extends S[K]["nullable"]
    ? never
    : true extends S[K]["nullable"]
      ? K
      : never
}[keyof S]

type TableSchema<S extends ColumnSchema> = {
  [K in keyof S]: ColumnType<S[K]>
}

export type SQLTableSchema<S extends ColumnSchema> = TableSchema<
  Omit<S, NullableKeys<S>>
> &
  Partial<TableSchema<Pick<S, NullableKeys<S>>>>
