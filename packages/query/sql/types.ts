/**
 * Types that are supported by SQL and their meanings for this library
 */

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

type EnumType = Record<string, string>

type SQLArray<ItemType = SQLColumnType | EnumType> = {
  itemType: ItemType
}

export type SQLType<S extends SQLColumnType | EnumType | SQLArray> =
  S extends SQLColumnType
    ? _SQLType<S>
    : S extends EnumType
      ? EnumType[keyof EnumType]
      : S extends SQLArray
        ? S["itemType"] extends SQLColumnType
          ? _SQLType<S["itemType"]>[]
          : S["itemType"] extends EnumType
            ? S["itemType"][keyof S["itemType"]][]
            : never
        : never

export type ColumnDefinition<ColumnType extends SQLColumnType> =
  BaseColumnDefinition<ColumnType> & ExtendedColumnDefinition<ColumnType>

type ExtendedColumnDefinition<ColumnType extends SQLColumnType> =
  ColumnType extends VariableSQLTypes
    ? VariableColumnDefinition<ColumnType>
    : ColumnType extends IncrementalSQLTypes
      ? IncrementalColumnDefinition<ColumnType>
      : // eslint-disable-next-line @typescript-eslint/ban-types
        {}

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

type _SQLType<T extends SQLColumnType | EnumType> = T extends SQLColumnType
  ? _SQLColumnType<T>
  : T extends EnumType
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
