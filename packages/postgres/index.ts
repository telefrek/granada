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

interface PostgresColumnTypeMapping {
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
  [PostgresColumnTypeName.REAL]: number
  [PostgresColumnTypeName.SERIAL]: number
  [PostgresColumnTypeName.SERIAL2]: number
  [PostgresColumnTypeName.SERIAL4]: number
  [PostgresColumnTypeName.SMALLINT]: number
  [PostgresColumnTypeName.SMALLSERIAL]: number
  [PostgresColumnTypeName.TEXT]: string
  [PostgresColumnTypeName.UUID]: string
}

type EnumType = Record<string, string>

/**
 * Represents an enum value
 */
export type PostgresEnum<E extends EnumType> = E[keyof E]

/**
 * Represents an array of {@link PostgresColumnTypes}
 */
export type PostgresArray<
  ItemType extends PostgresColumnTypeName | PostgresEnum<EnumType>,
> = ItemType[]

export type PostgresColumnTypes =
  | PostgresColumnTypeName
  | PostgresArray<PostgresColumnTypeName | PostgresEnum<EnumType>>
  | PostgresEnum<EnumType>

export type GetPostgresArrayType<
  T extends PostgresArray<PostgresColumnTypeName | PostgresEnum<EnumType>>,
> = T extends (infer U)[] ? (U extends PostgresEnum<EnumType> ? U : U) : never

export type PostgresColumnType<ColumnType extends PostgresColumnTypes> =
  ColumnType extends keyof PostgresColumnTypeMapping
    ? PostgresColumnTypeMapping[ColumnType]
    : ColumnType extends PostgresArray<
          PostgresColumnTypeName | PostgresEnum<EnumType>
        >
      ? GetPostgresArrayType<ColumnType>[]
      : ColumnType extends PostgresEnum<EnumType>
        ? ColumnType
        : never

export type PostgresSchema = { [key: string]: PostgresColumnTypes | undefined }

export interface PostgresTable {
  schema: PostgresSchema
}

export interface PostgresDatabase {
  tables: Record<string, PostgresTable>
}
