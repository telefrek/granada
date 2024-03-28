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

export type SQLEnumType = Record<string, string>

export type ValidSQLTypes = SQLColumnType | SQLEnumType

export type ColumnType<S extends SimpleColumnDefinition<ValidSQLTypes>> =
  unknown extends S["isArray"]
    ? SQLType<S["type"]>
    : true extends S["isArray"]
      ? SQLType<S["type"]>[]
      : SQLType<S["type"]>

export type SQLType<S extends ValidSQLTypes> = S extends SQLColumnType
  ? _SQLType<S>
  : S extends SQLEnumType
    ? S[keyof S]
    : never

export type ColumnDefinition<ColumnType extends ValidSQLTypes> =
  | SimpleColumnDefinition<ColumnType>
  | VariableColumnDefinition<ColumnType>
  | IncrementalColumnDefinition<ColumnType>

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

type VariableSQLTypes =
  | SQLColumnType.VARBINARY
  | SQLColumnType.VARCHAR
  | SQLColumnType.NVARCHAR

type IncrementalSQLTypes =
  | SQLColumnType.BIGINT
  | SQLColumnType.INT
  | SQLColumnType.FLOAT
  | SQLColumnType.DECIMAL

export type SimpleColumnDefinition<ColumnType extends ValidSQLTypes> = {
  type: ColumnType
  nullable?: boolean
  isArray?: boolean
}

type IncrementalColumnDefinition<ColumnType extends ValidSQLTypes> =
  ColumnType extends IncrementalSQLTypes
    ? SimpleColumnDefinition<ColumnType> & {
        autoIncrement?: boolean
      }
    : object

type VariableColumnDefinition<ColumnType extends ValidSQLTypes> =
  ColumnType extends VariableSQLTypes
    ? SimpleColumnDefinition<ColumnType> & {
        size: number
      }
    : object
