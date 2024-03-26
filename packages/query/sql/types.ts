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
  VARCHAR_N = "varchar_n",
  TEXT = "text",
  NCHAR = "nchar",
  NVARCHAR = "nvarchar",
  NVARCHAR_N = "nvarchar_n",
  NTEXT = "ntext",
  BINARY = "binary",
  VARBINARY = "varbinary",
  VARBINARY_N = "varbinary_n",
  IMAGE = "image",
  CLOB = "clob",
  BLOB = "blob",
  XML = "xml",
  JSON = "json",
}

export type SQLArray<ItemType extends SQLColumnType> = ItemType[]

export type SQLType<S> =
  S extends SQLArray<infer U>
    ? _SQLType<U>[]
    : S extends SQLColumnType
      ? _SQLType<S>
      : never

type _SQLType<T extends SQLColumnType> = T extends keyof SQLToTypescriptMapping
  ? SQLToTypescriptMapping[T]
  : never

interface SQLToTypescriptMapping {
  [SQLColumnType.BIT]: boolean
  [SQLColumnType.TINYINT]: number
  [SQLColumnType.SMALLINT]: number
  [SQLColumnType.INT]: number
  [SQLColumnType.BIGINT]: bigint
  [SQLColumnType.DECIMAL]: number
  [SQLColumnType.NUMERIC]: number
  [SQLColumnType.FLOAT]: number
  [SQLColumnType.REAL]: number
  [SQLColumnType.DATE]: string
  [SQLColumnType.TIME]: string
  [SQLColumnType.DATETIME]: Date
  [SQLColumnType.TIMESTAMP]: bigint
  [SQLColumnType.YEAR]: string
  [SQLColumnType.CHAR]: string
  [SQLColumnType.VARCHAR]: string
  [SQLColumnType.VARCHAR_N]: string
  [SQLColumnType.TEXT]: string
  [SQLColumnType.NCHAR]: string
  [SQLColumnType.NVARCHAR]: string
  [SQLColumnType.NVARCHAR_N]: string
  [SQLColumnType.NTEXT]: string
  [SQLColumnType.BINARY]: Int8Array
  [SQLColumnType.VARBINARY]: Int8Array
  [SQLColumnType.VARBINARY_N]: Int8Array
  [SQLColumnType.IMAGE]: Int8Array
  [SQLColumnType.CLOB]: string
  [SQLColumnType.BLOB]: Int8Array
  [SQLColumnType.XML]: string
  [SQLColumnType.JSON]: string
}
