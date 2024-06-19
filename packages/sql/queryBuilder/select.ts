import { type SQLDatabaseSchema, type SQLDatabaseTables } from "../schema.js"
import type { QueryContext, QueryContextColumns } from "./context.js"

export function createSelect<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables,
  Table extends keyof Active,
>(
  table: Table,
): SelectBuilder<
  Database,
  Active,
  Table,
  QueryContext<Database, Active, Active[Table]["columns"]>
> {
  return new DefaultSelectBuilder(table)
}

export interface SelectBuilder<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables,
  Table extends keyof Active,
  Context extends QueryContext<Database, Active>,
> {
  columns<C extends QueryContextColumns<Context>>(
    first: C,
    ...rest: C[]
  ): SelectBuilder<Database, Active, Table, Context>
}

class DefaultSelectBuilder<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables,
  Table extends keyof Active,
  Context extends QueryContext<Database, Active>,
> implements SelectBuilder<Database, Active, Table, Context>
{
  private _table: Table
  private _columns: string[] | "*" = "*"

  constructor(table: Table) {
    this._table = table
  }

  columns<C extends QueryContextColumns<Context>>(
    first: C,
    ...rest: C[]
  ): SelectBuilder<Database, Active, Table, Context> {
    this._columns = [first, ...rest]
    return this
  }
}
