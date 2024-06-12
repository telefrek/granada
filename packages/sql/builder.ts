/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Handles building AST queries
 */

import type { SQLColumnSchema, SQLDatabaseSchema } from "./schema.js"

type SelectColumns<T extends SQLColumnSchema> = "*" | (keyof T)[]

export interface SelectBuilder<
  Database extends SQLDatabaseSchema<any, any>,
  Table extends keyof Database["tables"],
  Returning extends SelectColumns<Database["tables"][Table]["columns"]> = "*",
> {
  readonly table: Table
  readonly returning: Returning

  columns<T extends keyof Database["tables"][Table]["columns"]>(
    first: T,
    ...rest: T[]
  ): SelectBuilder<Database, Table, T[]>
}

export function createSelectBuilder<
  Database extends SQLDatabaseSchema<any, any>,
  Table extends keyof Database["tables"],
>(schema: Database, table: Table): SelectBuilder<Database, Table> {
  return new _SelectBuilder(table, "*")
}

class _SelectBuilder<
  Database extends SQLDatabaseSchema<any, any>,
  Table extends keyof Database["tables"],
  Returning extends SelectColumns<Database["tables"][Table]["columns"]> = "*",
> implements SelectBuilder<Database, Table, Returning>
{
  readonly table: Table
  readonly returning: Returning

  constructor(table: Table, returning: Returning) {
    this.table = table
    this.returning = returning
  }

  columns<T extends keyof Database["tables"][Table]["columns"]>(
    first: T,
    ...rest: T[]
  ): SelectBuilder<Database, Table, T[]> {
    // TODO: Collapse to only include unique values
    return new _SelectBuilder<Database, Table, T[]>(this.table, [
      first,
      ...rest,
    ])
  }
}
