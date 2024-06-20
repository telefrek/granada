/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Handle schema generation and manipulation
 */

import type {
  Consolidate,
  Flatten,
  IsUnion,
  Keys,
} from "@telefrek/type-utils/index.js"
import type {
  IncrementalSQLTypes,
  SQLBuiltinTypes,
  TSSQLType,
  VariableSQLTypes,
} from "./types.js"

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

/**
 * A table key
 */
export type SQLTableKey<
  Schema extends SQLColumnSchema = SQLColumnSchema,
  PK extends
    | PrimaryKey<keyof Schema>
    | CompositePrimaryKey<keyof Schema> = PrimaryKey<keyof Schema>,
> = Flatten<
  SQLTableSchema<Schema> & {
    primaryKey: PK
  }
>

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
  columns: Columns[]
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

export function SQLColumn<
  T extends SQLBuiltinTypes,
  Options extends SQLColumnOptions<T>,
>(type: T, options?: Options): Consolidate<ColumnTypeDefinition<T>, Options> {
  return {
    ...options,
    type,
  } as any
}

export type TableColumnType<T extends ColumnTypeDefinition<any>> =
  T["array"] extends true ? TSSQLType<T["type"]>[] : TSSQLType<T["type"]>

export type SQLTableEntity<T extends SQLTableSchema> = SQLRowEntity<
  T["columns"]
>

export type SQLRowEntity<T extends SQLColumnSchema> = Flatten<
  {
    [K in RequiredKeys<T>]: TableColumnType<T[K]>
  } & {
    [K in NullableKeys<T>]?: TableColumnType<T[K]>
  }
>

export function createSchemaBuilder(): SQLSchemaBuilder<EmptySchema> {
  return new SQLSchemaBuilder({ tables: {}, relations: [] })
}

/**
 * Create a builder for manipulating the {@link SQLColumnSchema}
 *
 * @param columns The current columns
 * @returns A new {@link ColumnSchemaBuilder} for modifying the schema
 *
 * @template Columns The current SQLColumnSchema
 */
export function columnSchemaBuilder<Columns extends SQLColumnSchema = {}>(
  columns: Columns,
): ColumnSchemaBuilder<Columns> {
  return new ColumnSchemaBuilder(columns)
}

export type ColumnSchemaManager<
  Schema extends SQLColumnSchema,
  Result extends SQLColumnSchema,
> = (original: ColumnSchemaBuilder<Schema>) => ColumnSchemaBuilder<Result>

type ModifiedColumnSchema<
  Original extends SQLColumnSchema,
  Column extends string,
  ColumnType extends SQLBuiltinTypes,
  Options extends SQLColumnOptions<ColumnType>,
> = Flatten<
  Original & {
    [key in Column]: Consolidate<ColumnTypeDefinition<ColumnType>, Options>
  }
>

class ColumnSchemaBuilder<T extends SQLColumnSchema = {}> {
  private _schema: T
  constructor(schema: T) {
    this._schema = schema
  }

  get schema(): T {
    return this._schema
  }

  addColumn<
    Column extends string,
    CType extends SQLBuiltinTypes,
    Options extends SQLColumnOptions<CType>,
  >(
    column: Column,
    type: CType,
    options?: Options,
  ): ColumnSchemaBuilder<ModifiedColumnSchema<T, Column, CType, Options>> {
    // Add the property
    Object.defineProperty(this._schema, column, {
      value: SQLColumn(type, options),
    })

    // Return the updated typed builder
    return new ColumnSchemaBuilder<
      ModifiedColumnSchema<T, Column, CType, Options>
    >(this._schema as any)
  }
}

class SQLSchemaBuilder<T extends SQLDatabaseSchema<any, any>> {
  private _schema: T
  constructor(schema: T) {
    this._schema = schema
  }

  get schema(): T {
    return this._schema
  }

  addTable<
    Name extends string,
    Builder extends SQLTableSchemaBuilder<Name, any, any>,
  >(
    name: Name,
    builder: (b: SQLTableSchemaBuilder<Name>) => Builder,
  ): SQLSchemaBuilder<
    Builder extends SQLTableSchemaBuilder<Name, infer _, infer Schema>
      ? AddTableToSchema<T, Name, Schema>
      : never
  > {
    const ts: SQLTableSchema<{}> = { columns: {} }
    const schema = builder(
      new SQLTableSchemaBuilder(name, ts as SQLTableSchema<{}>),
    ).schema
    Object.defineProperty(this._schema.tables, name, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: schema,
    })
    return this as any
  }
}

type AddTableToSchema<
  Schema extends SQLDatabaseSchema,
  Name extends string,
  TableSchema extends SQLTableSchema,
> =
  Schema extends SQLDatabaseSchema<infer Tables, infer Relations>
    ? SQLDatabaseSchema<
        Flatten<Tables & { [key in Name]: TableSchema }>,
        Relations
      >
    : never

class SQLTableSchemaBuilder<
  Name extends string,
  Columns extends SQLColumnSchema = {},
  Schema extends SQLTableSchema<Columns> = SQLTableSchema<Columns>,
> {
  private _name: Name
  private _schema: Schema

  constructor(name: Name, schema: Schema) {
    this._name = name
    this._schema = schema
  }

  get schema(): Schema {
    return this._schema
  }

  addColumn<
    Column extends string,
    CType extends SQLBuiltinTypes,
    Options extends SQLColumnOptions<CType>,
  >(
    column: Column,
    type: CType,
    options?: Options,
  ): SQLTableSchemaBuilder<
    Name,
    Flatten<
      Columns & {
        [key in Column]: Consolidate<ColumnTypeDefinition<CType>, Options>
      }
    >
  > {
    Object.defineProperty(this._schema["columns"], column, {
      enumerable: true,
      configurable: false,
      writable: false,
      value: SQLColumn(type, options),
    })

    return new SQLTableSchemaBuilder(this._name, this._schema as any)
  }

  withKey<Column extends Keys<Columns>>(
    primary: Column,
    ...secondary: Column[]
  ): SQLTableSchemaBuilder<
    Name,
    Columns,
    SQLTableKey<
      Columns,
      IsUnion<Column> extends true
        ? CompositePrimaryKey<Column>
        : PrimaryKey<Column>
    >
  > {
    if (secondary !== undefined && secondary.length > 0) {
      Object.defineProperty(this._schema, "primaryKey", {
        value: { columns: [primary, ...secondary] },
      })
      return new SQLTableSchemaBuilder(this._name, this._schema as any)
    }

    Object.defineProperty(this._schema, "primaryKey", {
      value: { column: primary },
    })

    return new SQLTableSchemaBuilder(this._name, this._schema as any)
  }
}

type RequiredKeys<T extends SQLColumnSchema> = {
  [K in keyof T]: T[K]["nullable"] extends true ? never : K
}[keyof T]

type NullableKeys<T extends SQLColumnSchema> = {
  [K in keyof T]: T[K]["nullable"] extends true ? K : never
}[keyof T]

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
