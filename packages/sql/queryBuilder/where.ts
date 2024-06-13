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

type ColumnValue<
  T extends QueryContext<any>,
  C,
  K extends keyof T = keyof T,
> = TableColumnType<T[K][C]["definition"]>

export interface WhereClauseBuilder<Context extends QueryContext<any>> {
  eq<
    Column extends Keys<Context>,
    Table extends TableWithKey<Context, Column>,
    Value extends ColumnValue<Context, Column, Table>,
  >(
    column: Column,
    table: Table,
    value: Value,
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
    Value extends TableColumnType<Context[Table][Column]["definition"]>,
  >(column: Column, table: Table, value: Value): void {
    log(`Column: ${String(column)}, Table: ${String(table)}, Value: ${value}`)
  }
}
