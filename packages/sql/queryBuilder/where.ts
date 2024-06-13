/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Where query clause building
 */

import { log } from "console"
import type { TableColumnType } from "../schema.js"
import { type QueryContext } from "./context.js"

type Keys<T extends QueryContext<any>> = {
  [K in keyof T]: keyof T[K]
}[keyof T]

type TableWithKey<T extends QueryContext<any>, N> = {
  [K in keyof T]: N extends keyof T[K] ? K : never
}[keyof T]

type Parameter<
  V,
  T extends QueryContext<any>,
  C,
  K extends keyof T = keyof T,
> = V extends `:${infer _}`
  ? V
  : V extends `$${infer _}`
    ? V
    : TableColumnType<T[K][C]["definition"]>

export interface WhereClauseBuilder<Context extends QueryContext<any>> {
  eq<
    Column extends Keys<Context>,
    Table extends TableWithKey<Context, Column>,
    //Value extends ColumnValue<Context, Column, Table>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column, Table>,
  ): void
}

export function whereClause<Context extends QueryContext<any>>(
  context: Context,
): WhereClauseBuilder<Context> {
  return new DefaultWhereClauseBuilder(context)
}

class DefaultWhereClauseBuilder<Context extends QueryContext<any>>
  implements WhereClauseBuilder<Context>
{
  private _context: Context

  constructor(context: Context) {
    this._context = context
  }
  eq<
    Column extends Keys<Context>,
    Table extends TableWithKey<Context, Column>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column, Table>,
  ): void {
    log(`Column: ${String(column)}, Table: ${String(table)}, Value: ${value}`)
  }
}
