/**
 * Types that are supported by SQL and their meanings for this library
 */

import type { PropertyOfType } from "@telefrek/core/type/utils"
import type { QueryParameters } from "../index"
import type { SQLDataTable } from "./index"

/**
 * Helper class for building type definitions
 */
export class SQLColumnTypes {
  static enum = <T extends SQLEnumType>(type: T): BaseColumnDefinition<T> => {
    return {
      type,
    }
  }

  static of = <T extends ValidSQLTypes>(type: T): BaseColumnDefinition<T> => {
    return {
      type,
    }
  }

  static variable = <T extends VariableSQLTypes>(
    type: T,
    maxSize?: number,
  ): VariableColumnDefinition<T> => {
    return {
      type,
      size: maxSize ?? -1,
    }
  }

  static incremental = <T extends IncrementalSQLTypes>(
    type: T,
    autoIncrement?: boolean,
  ): IncrementalColumnDefinition<T> => {
    return {
      type,
      autoIncrement: autoIncrement ?? true,
    }
  }

  static arrayOf = <T extends ValidSQLTypes>(
    definition: ColumnDefinition<T> | T,
  ): ColumnDefinition<T>[] => {
    return [
      typeof definition === "object"
        ? (definition as ColumnDefinition<T>)
        : (SQLColumnTypes.of(definition) as ColumnDefinition<T>),
    ]
  }
}

export enum SQLColumnType {
  BIT = "bit",
  TINYINT = "tinyint",
  SMALLINT = "smallint",
  INT = "int",
  BIGINT = "bigint",
  DECIMAL = "decimal",
  NUMERIC = "numeric",
  FLOAT = "float",
  REAL = "real",
  DATE = "date",
  TIME = "time",
  DATETIME = "datetime",
  TIMESTAMP = "timestamp",
  YEAR = "year",
  CHAR = "char",
  VARCHAR = "varchar",
  TEXT = "text",
  NCHAR = "nchar",
  NVARCHAR = "nvarchar",
  NTEXT = "ntext",
  BINARY = "binary",
  VARBINARY = "varbinary",
  IMAGE = "image",
  CLOB = "clob",
  BLOB = "blob",
  XML = "xml",
  JSON = "json",
}

export type SQLEnumType = Record<string, string>

export type SQLEnum<E extends SQLEnumType> = E[keyof E]

export type ValidSQLTypes = SQLColumnType | SQLEnumType

export type SQLType<S extends ValidSQLTypes> = S extends SQLColumnType
  ? _SQLType<S>
  : S extends SQLEnumType
    ? S[keyof S]
    : never

export type BaseColumnDefinition<ColumnType extends ValidSQLTypes> = {
  type: ColumnType
}

export type ColumnDefinition<ColumnType extends ValidSQLTypes> =
  ColumnType extends IncrementalSQLTypes
    ? IncrementalColumnDefinition<ColumnType>
    : ColumnType extends VariableSQLTypes
      ? VariableColumnDefinition<ColumnType>
      : BaseColumnDefinition<ColumnType>

export type ParameterOrValue<
  T extends SQLDataTable,
  C extends keyof T,
  P extends QueryParameters,
> = [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>

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

type _SQLType<T extends SQLColumnType | SQLEnumType> = T extends SQLColumnType
  ? _SQLColumnType<T>
  : T extends SQLEnumType
    ? T[keyof T]
    : never

type _SQLColumnType<T extends SQLColumnType> = [T] extends [BigIntSQLTypes]
  ? number | bigint
  : [T] extends [BinarySQLTypes]
    ? Int8Array
    : [T] extends [NumericSQLTypes]
      ? number
      : T extends SQLColumnType.BIT
        ? boolean
        : string

export type VariableSQLTypes =
  | SQLColumnType.VARBINARY
  | SQLColumnType.VARCHAR
  | SQLColumnType.NVARCHAR

export type IncrementalSQLTypes =
  | SQLColumnType.BIGINT
  | SQLColumnType.INT
  | SQLColumnType.FLOAT
  | SQLColumnType.DECIMAL

export type IncrementalColumnDefinition<
  ColumnType extends IncrementalSQLTypes,
> = BaseColumnDefinition<ColumnType> & {
  autoIncrement: boolean
}

export type VariableColumnDefinition<ColumnType extends VariableSQLTypes> =
  BaseColumnDefinition<ColumnType> & {
    size: number
  }
