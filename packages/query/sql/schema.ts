import { getDebugInfo } from "@telefrek/core"
import type {
  MatchingProperty,
  OptionalLiteralKeys,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils"
import type { SQLArray, SQLColumnType, SQLType } from "./types"

export type ModifiedTables<
  D extends DatabaseTables,
  N extends string,
  S extends ColumnSchema,
> = {
  [key in keyof D | N]: key extends keyof D ? D[key] : SQLTableDefinition<S>
}

export class SchemaBuilder<
  // eslint-disable-next-line @typescript-eslint/ban-types
  T extends DatabaseTables = {},
  D extends SQLDatabase<T> = SQLDatabase<T>,
> {
  private readonly tables: T
  private readonly customTypes?: CustomTypes
  private readonly relations?: ForeignKey[]

  constructor(
    tables: T = {} as T,
    customTypes?: CustomTypes,
    relations?: ForeignKey[],
  ) {
    this.tables = tables
    this.customTypes = customTypes
    this.relations = relations
  }

  withTable<const Schema extends ColumnSchema, Name extends string>(
    schema: Schema,
    name: Name,
    tableKey: PrimaryKey<Schema> | CompositePrimaryKey<Schema>,
  ): SchemaBuilder<ModifiedTables<T, Name, Schema>> {
    const modified: ModifiedTables<T, Name, Schema> = Object.fromEntries(
      Object.keys(this.tables)
        .map((k) => [k as PropertyKey, this.tables[k]])
        .concat([
          [
            name,
            {
              columns: schema,
              key: tableKey,
            },
          ],
        ]),
    ) as ModifiedTables<T, Name, Schema>

    return new SchemaBuilder<ModifiedTables<T, Name, Schema>>(
      modified,
      this.customTypes,
    )
  }

  withForeignKey<
    Left extends keyof T,
    Right extends keyof T,
    LeftColumn extends keyof T[Left]["columns"],
    RightColumn extends MatchingProperty<
      T[Left]["columns"],
      T[Right]["columns"],
      LeftColumn
    >,
  >(
    leftTable: Left,
    rightTable: Right,
    leftColumn: LeftColumn,
    rightColumn: RightColumn,
  ): SchemaBuilder<T, D> {
    const key: ForeignKey = {
      left: leftTable as string,
      right: rightTable as string,
      leftColumn: leftColumn as string,
      rightColumn: rightColumn as string,
    }

    console.log(getDebugInfo(key))

    if (this.relations) {
      this.relations.push(key)
      return this
    }

    return new SchemaBuilder(this.tables, this.customTypes, [key])
  }

  build(): D {
    return {
      tables: this.tables,
      customTypes: this.customTypes,
      relations: this.relations,
    } as D
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CustomSQLType = Record<string, any>

type CustomTypes = {
  [key: string]: CustomSQLType
}

export type ColumnDefinition<ColumnType extends SQLColumnType> =
  ColumnType extends VariableSQLTypes
    ? VariableColumnDefinition<ColumnType>
    : ColumnType extends IncrementalSQLTypes
      ? IncrementalColumnDefinition<ColumnType>
      : BaseColumnDefinition<ColumnType>

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

export type SQLDatabase<Tables extends DatabaseTables> = {
  tables: Tables
  customTypes?: CustomTypes
  relations?: ForeignKey[]
}

export type DatabaseTables = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: SQLTableDefinition<any>
}

export type ForeignKey = {
  left: string
  right: string
  leftColumn: string
  rightColumn: string
}

export type SQLDatabaseRowSchema<Database extends SQLDatabase<DatabaseTables>> =
  {
    [key in keyof Database["tables"]]: Database["tables"][key] extends SQLTableDefinition<
      infer S
    >
      ? SQLTableRowSchema<SQLTableDefinition<S>["columns"]>
      : never
  }

export interface ColumnSchema {
  [key: string]: SQLColumnType | SQLArray<SQLColumnType> | undefined
}

type ColumnDefaults<Schema extends ColumnSchema> = {
  [key in keyof Schema]?:
    | SQLType<Required<Schema>[key]>
    | (() => SQLType<Required<Schema>[key]>)
}

export interface PrimaryKey<Schema extends ColumnSchema> {
  column: keyof Schema
}

export interface CompositePrimaryKey<Schema extends ColumnSchema> {
  columns: (keyof Schema)[]
}

export interface SQLTableDefinition<Schema extends ColumnSchema> {
  columns: Schema
  key: PrimaryKey<Schema> | CompositePrimaryKey<Schema>
  defaults?: ColumnDefaults<Schema>
}

export type SQLTableRowSchema<S extends ColumnSchema> = {
  [key in keyof RequiredLiteralKeys<S>]: SQLType<S[key]>
} & Partial<{
  [key in keyof Required<Pick<S, keyof OptionalLiteralKeys<S>>>]: SQLType<
    Required<Pick<S, keyof OptionalLiteralKeys<S>>>[key]
  >
}>
