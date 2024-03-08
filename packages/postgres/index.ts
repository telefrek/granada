/**
 * Contains the entrypoints for working with Postgres
 */

// TODO: Support more opaque Postgres specific types...

export enum PostgresColumnTypeName {
  BIGINT = "bigint",
  BIGSERIAL = "bigserial",
  BOOLEAN = "boolean",
  BYTEA = "bytea",
  CHARACTER_N = "character",
  CHARACTER_VARYING = "character varying",
  DATE = "date",
  DOUBLE_PRECISION = "double precision",
  FLOAT4 = "float4",
  FLOAT8 = "float8",
  INTEGER = "integer",
  INTERVAL = "interval",
  INT = "int",
  INT2 = "int2",
  INT4 = "int4",
  JSON = "json",
  JSONB = "jsonb",
  REAL = "real",
  SERIAL = "serial",
  SERIAL2 = "serial2",
  SERIAL4 = "serial4",
  SMALLINT = "smallint",
  SMALLSERIAL = "smallserial",
  TEXT = "text",
  TIME = "time",
  TIMESTAMP = "timestamp",
  UUID = "uuid",
}

/**
 * Represents an enum value
 */
export type PostgresEnum<EnumType extends Record<string, string>> =
  EnumType[keyof EnumType]

/**
 * Represents an array of {@link PostgresColumnTypes}
 */
export interface PostgresArray<
  ItemType extends PostgresColumnTypeName | PostgresEnum<any>
> {
  itemType: ItemType
}

export type PostgresColumnTypes =
  | PostgresColumnTypeName
  | PostgresArray<PostgresColumnTypeName | PostgresEnum<Record<string, string>>>
  | PostgresEnum<Record<string, string>>

export type PostgresColumnTypeDebug<ColumnType extends PostgresColumnTypes> =
  ColumnType extends keyof PostgresColumnTypeMapping
    ? PostgresColumnTypeMapping[ColumnType]
    : ColumnType extends PostgresArray<PostgresColumnTypes>
    ? ColumnType["itemType"] extends keyof PostgresColumnTypeMapping
      ? PostgresColumnTypeMapping[ColumnType["itemType"]]
      : ColumnType["itemType"] extends PostgresEnum<Record<string, string>>
      ? ColumnType["itemType"][]
      : never
    : ColumnType extends PostgresEnum<Record<string, string>>
    ? ColumnType
    : never

export type PostgresColumnType<ColumnType extends PostgresColumnTypes> =
  ColumnType extends keyof PostgresColumnTypeName
    ? PostgresColumnTypeName[ColumnType] extends keyof PostgresColumnTypeMapping
      ? PostgresColumnTypeMapping[PostgresColumnTypeName[ColumnType]]
      : never
    : ColumnType extends PostgresArray<PostgresColumnTypeName>
    ? ColumnType["itemType"] extends keyof PostgresColumnTypeName
      ? PostgresColumnTypeName[ColumnType["itemType"]] extends keyof PostgresColumnTypeMapping
        ? PostgresColumnTypeMapping[PostgresColumnTypeName[ColumnType["itemType"]]]
        : never
      : ColumnType["itemType"] extends PostgresEnum<Record<string, string>>
      ? string
      : never
    : ColumnType extends PostgresEnum<Record<string, string>>
    ? string
    : never

export interface PostgresTable {
  schema: {
    [key: string]: PostgresColumnTypes
  }
}

export interface PostgresDatabase {
  tables: {
    [key: string]: PostgresTable
  }
}

type PostgresColumnTypeMapping = {
  [PostgresColumnTypeName.BIGINT]: bigint
  [PostgresColumnTypeName.BIGSERIAL]: bigint
  [PostgresColumnTypeName.BOOLEAN]: boolean
  [PostgresColumnTypeName.BYTEA]: Int8Array
  [PostgresColumnTypeName.DOUBLE_PRECISION]: number
  [PostgresColumnTypeName.FLOAT4]: number
  [PostgresColumnTypeName.FLOAT8]: number
  [PostgresColumnTypeName.INTEGER]: number
  [PostgresColumnTypeName.INT]: number
  [PostgresColumnTypeName.INT2]: number
  [PostgresColumnTypeName.INT4]: number
  [PostgresColumnTypeName.JSON]: string
  [PostgresColumnTypeName.JSONB]: object
  [PostgresColumnTypeName.SERIAL]: number
  [PostgresColumnTypeName.SERIAL2]: number
  [PostgresColumnTypeName.SERIAL4]: number
  [PostgresColumnTypeName.SMALLINT]: number
  [PostgresColumnTypeName.SMALLSERIAL]: number
  [PostgresColumnTypeName.TEXT]: string
  [PostgresColumnTypeName.UUID]: string
}
