/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Handle schema generation and manipulation
 */

import type {
  IncrementalSQLTypes,
  SQLBuiltinTypes,
  TSSQLType,
  VariableSQLTypes,
} from "./types.js"
import type { Flatten } from "./utils.js"

/**
 * Define a schema
 */
export type SQLColumnSchema = {
  [key: string]: ColumnTypeDefinition<any>
}

/**
 * Basic table definition with columns
 */
export type SQLTableSchema<Schema extends SQLColumnSchema = SQLColumnSchema> = {
  columns: Schema
}

// TODO: Need to add table options

/**
 * A table key
 */
export type TableKey<
  Schema extends SQLColumnSchema = SQLColumnSchema,
  PK extends
    | PrimaryKey<keyof Schema>
    | CompositePrimaryKey<(keyof Schema)[]> = PrimaryKey<keyof Schema>,
> = {
  primaryKey: PK
}

export type SQLDatabaseTables = {
  [key: string]: SQLTableSchema<any>
}

export type SQLDatabaseSchema<
  Tables extends SQLDatabaseTables = SQLDatabaseTables,
  Relations extends ForeignKey<any>[] = [],
> = {
  tables: Tables
  relations: Relations
}

type EmptySchema = SQLDatabaseSchema<{}, []>

export type ColumnTypeDefinition<T> = [T] extends [SQLBuiltinTypes]
  ? Flatten<IncrementalType<T> & VariableType<T> & BaseColumnDefinition<T>>
  : never

export type PrimaryKey<Column> = {
  column: Column
}

export type CompositePrimaryKey<Columns> = {
  columns: Columns
}

export type ForeignKey<
  Left extends SQLColumnSchema = SQLColumnSchema,
  Right extends SQLColumnSchema = SQLColumnSchema,
  LeftColumn extends keyof Left = keyof Left,
  RightColumn extends keyof Right = keyof Right,
> = {
  left: Left
  right: Right
  leftColumn: LeftColumn
  rightColumn: RightColumn
}

export type SQLColumnOptions<T extends SQLBuiltinTypes> = Flatten<
  {
    array?: boolean
    nullable?: boolean
  } & IncrementalType<T> &
    VariableType<T>
>

export function SQLColumn<T extends SQLBuiltinTypes>(
  type: T,
  options?: SQLColumnOptions<T>,
): ColumnTypeDefinition<T> {
  return {
    ...options,
    type,
    nullable: options?.nullable ?? false,
    array: options?.array ?? false,
  } as ColumnTypeDefinition<T>
}

export type TableColumnType<T extends ColumnTypeDefinition<SQLBuiltinTypes>> =
  T["array"] extends true ? TSSQLType<T["type"]>[] : TSSQLType<T["type"]>

export type SQLTableEntity<T extends SQLTableSchema> = Flatten<
  {
    [K in RequiredKeys<T>]: TableColumnType<T["columns"][K]>
  } & {
    [K in NullableKeys<T>]?: TableColumnType<T["columns"][K]>
  }
>

export function createSchemaBuilder(): SQLSchemaBuilder<EmptySchema> {
  return new SQLSchemaBuilder({ tables: {}, relations: [] })
}

class SQLSchemaBuilder<T extends SQLDatabaseSchema<any>> {
  _schema: T
  constructor(schema: T) {
    this._schema = schema
  }

  createTable<Name extends string>(
    name: Name,
  ): SQLTableSchemaBuilder<{}, Name, T> {
    return new SQLTableSchemaBuilder(name, {}, this)
  }

  build(): T {
    return this._schema
  }
}

class SQLTableSchemaBuilder<
  Columns extends SQLColumnSchema,
  Name extends string,
  T extends SQLDatabaseSchema<any>,
> {
  _columns: Columns
  _name: Name
  _builder: SQLSchemaBuilder<T>
  constructor(name: Name, columns: Columns, builder: SQLSchemaBuilder<T>) {
    this._name = name
    this._columns = columns
    this._builder = builder
  }

  addColumn<Column extends string, CType extends SQLBuiltinTypes>(
    column: Column,
    type: CType,
    options?: SQLColumnOptions<CType>,
  ) {
    ;(this._columns as any)[column] = SQLColumn(type, options)

    return new SQLTableSchemaBuilder<
      Flatten<Columns & { [key in Column]: ColumnTypeDefinition<CType> }>,
      Name,
      T
    >(this._name, this._columns as any, this._builder)
  }

  addTable<Column extends keyof Columns>(
    key: Column,
  ): SQLSchemaBuilder<{
    tables: Flatten<
      T["tables"] & {
        [key in Name]: {
          columns: Columns
          key: PrimaryKey<Column>
        }
      }
    >
    relations: T["relations"]
  }> {
    const tables = this._builder._schema["tables"] as any
    tables[this._name] = {
      columns: this._columns,
      key: {
        column: key,
      },
    }

    return this._builder as SQLSchemaBuilder<{
      tables: Flatten<
        T["tables"] & {
          [key in Name]: {
            columns: Columns
            key: PrimaryKey<Column>
          }
        }
      >
      relations: T["relations"]
    }>
  }
}

type RequiredKeys<T extends SQLTableSchema> = {
  [K in keyof T["columns"]]: T["columns"][K]["nullable"] extends true
    ? never
    : K
}[keyof T["columns"]]

type NullableKeys<T extends SQLTableSchema> = {
  [K in keyof T["columns"]]: T["columns"][K]["nullable"] extends true
    ? K
    : never
}[keyof T["columns"]]

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
