import type {
  OptionalLiteralKeys,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils"
import type { SQLArray, SQLColumnType } from "../types"

export type ColumnDefinition<ColumnType extends SQLColumnType> =
  ColumnType extends VariableSQLTypes
    ? VariableColumnDefinition<ColumnType>
    : ColumnType extends IncrementalSQLTypes
      ? IncrementalColumnDefinition<ColumnType>
      : BaseColumnDefinition<ColumnType>

type VariableSQLTypes =
  | SQLColumnType.VARBINARY
  | SQLColumnType.VARCHAR
  | SQLColumnType.NVARCHAR

type IncrementalSQLTypes =
  | SQLColumnType.BIGINT
  | SQLColumnType.INT
  | SQLColumnType.FLOAT
  | SQLColumnType.DECIMAL

type BaseColumnDefinition<ColumnType extends SQLColumnType> = {
  type: ColumnType | SQLArray<ColumnType>
  nullable: boolean
  default?: SQLType<ColumnType> | (() => SQLType<ColumnType>)
}

type IncrementalColumnDefinition<ColumnType extends IncrementalSQLTypes> =
  BaseColumnDefinition<ColumnType> & {
    autoIncrement?: boolean
  }

type VariableColumnDefinition<ColumnType extends VariableSQLTypes> =
  BaseColumnDefinition<ColumnType> & {
    size: number
  }

export type SQLDatabase<Tables extends DatabaseTables> = {
  tables: Tables
  relations?: ForeignKey[]
}

export type DatabaseTables = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: SQLTableDefinition<any>
}

export type ForeignKey = {
  left: string
  right: string
  leftColumn: string
  rightColumn: string
}

export type SQLDatabaseRowSchema<Database extends SQLDatabase<DatabaseTables>> =
  {
    [key in keyof Database["tables"]]: Database["tables"][key] extends SQLTableDefinition<
      infer S
    >
      ? SQLTableRowSchema<SQLTableDefinition<S>["columns"]>
      : never
  }

export interface ColumnSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: ColumnDefinition<any> | undefined
}

export interface PrimaryKey<Schema extends ColumnSchema> {
  column: keyof Schema
}

export interface CompositePrimaryKey<Schema extends ColumnSchema> {
  columns: (keyof Schema)[]
}

export interface SQLTableDefinition<Schema extends ColumnSchema> {
  columns: Schema
  key: PrimaryKey<Schema> | CompositePrimaryKey<Schema>
}

export type SQLTableRowSchema<S extends ColumnSchema> = {
  [key in keyof RequiredLiteralKeys<S>]: SQLType<S[key]>
} & Partial<{
  [key in keyof Required<Pick<S, keyof OptionalLiteralKeys<S>>>]: SQLType<
    Required<Pick<S, keyof OptionalLiteralKeys<S>>>[key]
  >
}>

export type SQLType<S> =
  S extends SQLArray<infer U> ? _SQLDefinedType<U>[] : _SQLDefinedType<S>

type BigIntSQLTypes = SQLColumnType.BIGINT | SQLColumnType.TIMESTAMP

type BinarySQLTypes =
  | SQLColumnType.BINARY
  | SQLColumnType.BLOB
  | SQLColumnType.CLOB
  | SQLColumnType.VARBINARY
  | SQLColumnType.IMAGE

type NumericSQLTypes =
  | SQLColumnType.DECIMAL
  | SQLColumnType.FLOAT
  | SQLColumnType.INT
  | SQLColumnType.NUMERIC
  | SQLColumnType.REAL
  | SQLColumnType.SMALLINT
  | SQLColumnType.TINYINT

type _SQLDefinedType<T> =
  T extends ColumnDefinition<infer U> ? _SQLType<U> : never

type _SQLType<T extends SQLColumnType> = T extends BigIntSQLTypes
  ? number | bigint
  : T extends BinarySQLTypes
    ? Int8Array
    : T extends NumericSQLTypes
      ? number
      : T extends SQLColumnType.BIT
        ? boolean
        : string
