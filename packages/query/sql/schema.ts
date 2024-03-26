import type {
  MatchingProperty,
  OptionalLiteralKeys,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils.js"
import type { SQLArray, SQLColumnType, SQLType } from "./types"

export type DatabaseTables = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: SQLTableDefinition<any>
}

export type ForeignKey<
  Database extends DatabaseTables,
  Left extends keyof Database,
  Right extends keyof Database,
  LeftColumn extends keyof Database[Left]["columns"],
> = {
  left: Left
  right: Right
  leftColumn: LeftColumn
  rightColumn: MatchingProperty<
    Database[Left]["columns"],
    Database[Right]["columns"],
    LeftColumn
  >
}

export type ForeignKeys<Database extends DatabaseTables> = {
  relations?: ForeignKey<
    Database,
    keyof Database,
    keyof Database,
    keyof Database[keyof Database]["columns"]
  >[]
}

export type SQLDatabase<Tables extends DatabaseTables> = ForeignKeys<Tables> & {
  tables: Tables
  customTypes?: {
    [key: string]: Record<string, string>
  }
}

export type SQLDatabaseRowSchema<Database extends DatabaseTables> = {
  tables: {
    [key in keyof Database["tables"]]: Database["tables"][key] extends SQLTableDefinition<
      infer S
    >
      ? SQLTableDefinition<S>
      : never
  }
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
