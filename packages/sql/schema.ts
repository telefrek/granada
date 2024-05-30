/**
 * Handle schema generation and manipulation
 */

import type {
  IncrementalSQLTypes,
  SQLBuiltinTypes,
  TSSQLType,
  VariableSQLTypes,
} from "./types.js"

type BaseColumnDefinition<T extends SQLBuiltinTypes> = {
  type: T
  array?: boolean
  nullable?: boolean
}

type IncrementalType<T extends SQLBuiltinTypes> = [T] extends [
  IncrementalSQLTypes,
]
  ? {
      autoIncrement?: boolean
    }
  : object

type VariableType<T extends SQLBuiltinTypes> = [T] extends [VariableSQLTypes]
  ? {
      size?: number
    }
  : object

type SQLColumnOptions<T extends SQLBuiltinTypes> = {
  array?: boolean
  nullable?: boolean
} & IncrementalType<T> &
  VariableType<T>

export function SQLColumn<T extends SQLBuiltinTypes>(
  type: T,
  options?: SQLColumnOptions<T>,
): ColumnTypeDefinition<T> {
  return {
    ...options,
    type,
    nullable: options?.nullable ?? false,
  } as ColumnTypeDefinition<T>
}

export type ColumnTypeDefinition<T> = [T] extends [SQLBuiltinTypes]
  ? IncrementalType<T> & VariableType<T> & BaseColumnDefinition<T>
  : never

export type SQLTable = {
  columns: {
    [key: string]: AnyColumnDefinition
  }
}

export type Database = {
  tables: {
    [name: string]: SQLTable
  }
}

export type TableColumnType<T extends ColumnTypeDefinition<SQLBuiltinTypes>> =
  T["array"] extends true ? TSSQLType<T["type"]>[] : TSSQLType<T["type"]>

export type SQLTableEntity<T extends SQLTable> = {
  [K in RequiredKeys<T>]: TableColumnType<T["columns"][K]>
} & {
  [K in NullableKeys<T>]?: TableColumnType<T["columns"][K]>
}

type RequiredKeys<T extends SQLTable> = {
  [K in keyof T["columns"]]: T["columns"][K]["nullable"] extends true
    ? never
    : K
}[keyof T["columns"]]

type NullableKeys<T extends SQLTable> = {
  [K in keyof T["columns"]]: T["columns"][K]["nullable"] extends true
    ? K
    : never
}[keyof T["columns"]]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColumnDefinition = ColumnTypeDefinition<any>
