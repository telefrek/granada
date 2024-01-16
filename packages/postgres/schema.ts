/**
 * This package defines the shape of postgres table and object schemas
 */

/**
 * Defines the types of columns that are allowed
 */
export enum PostgresColumnTypes {
  UUID = "uuid",
  TEXT = "text",
  INTEGER = "integer",
  BOOLEAN = "boolean",
  JSONB = "jsonb",
}

/**
 * Represents an enum value
 */
export type PostgresEnum<T extends Record<string | number, string>> = T[keyof T]

/**
 * Defines the information about a column necessary to track it as infrastructure
 * as well as the typing system
 */
export interface PostgresColumn {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-explicit-any
  type: PostgresColumnTypes | PostgresEnum<any> | PostgresArray<any>
  defaultValue?: unknown
}

export interface PostgresArray<T extends PostgresColumnTypes> {
  itemType: T
}

/**
 * Utility type for indicating a table schema as a column name and {@link PostgresColumn} definition
 */
export type PostgresTable = Record<string, PostgresColumn>

/**
 * Represents the definition for a given schema (collection of objects)
 */
export interface Schema {
  /** The {@link PostgresTable} definitions in this schema */
  tables: Record<string, PostgresTable>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enums: Record<string, PostgresEnum<any>>
}

/**
 * Interface for defining what a type mapping should look like in typescript
 */
interface PostgresTypeMapping {
  uuid: string
  text: string
  integer: number
  boolean: boolean
  jsonb: object
}

/**
 * Utility type for mapping a {@link PostgresColumn} to it's {@link PostgresTypeMapping}
 */
export type PostgresColumnType<T extends PostgresColumn> =
  T["type"] extends PostgresArray<never>
    ? PostgresTypeMapping[T["type"]["itemType"]][]
    : PostgresTypeMapping[T["type"]]
