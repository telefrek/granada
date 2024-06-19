/* eslint-disable @typescript-eslint/no-explicit-any */
import { type SQLDatabaseTables } from "../schema.js"
import type {
  QueryContext,
  QueryContextColumns,
  TableContext,
} from "./context.js"

type SingleTableContext<
  Schema extends SQLDatabaseTables,
  Table extends keyof Schema,
> =
  {
    [key in Table]: TableContext<Table & string, Schema[Table]["columns"]>
  } extends QueryContext<infer Ctx>
    ? QueryContext<Ctx>
    : never

export function createSelect<
  Tables extends SQLDatabaseTables,
  Table extends keyof Tables,
>(
  table: Table,
): SelectBuilder<Tables, Table, SingleTableContext<Tables, Table>> {
  return new DefaultSelectBuilder(table)
}

export interface SelectBuilder<
  Schema extends SQLDatabaseTables,
  Table extends keyof Schema,
  Context extends QueryContext<any>,
> {
  columns<C extends QueryContextColumns<Context>>(
    first: C,
    ...rest: C[]
  ): SelectBuilder<Schema, Table, Context>

  col(
    first: QueryContextColumns<Context>,
  ): SelectBuilder<Schema, Table, Context>
}

class DefaultSelectBuilder<
  Schema extends SQLDatabaseTables,
  Table extends keyof Schema,
  Context extends QueryContext<any>,
> implements SelectBuilder<Schema, Table, Context>
{
  private _table: Table
  private _columns: string[] | "*" = "*"

  constructor(table: Table) {
    this._table = table
  }

  columns<C extends QueryContextColumns<Context>>(
    first: C,
    ...rest: C[]
  ): SelectBuilder<Schema, Table, Context> {
    this._columns = [first, ...rest]
    return this
  }

  col(
    first: QueryContextColumns<Context>,
  ): SelectBuilder<Schema, Table, Context> {
    this._columns = [first]
    return this
  }
}
