/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Flatten, IsUnion, Keys } from "@telefrek/type-utils"
import { type ColumnTypeDefinition } from "../schema.js"

export type QueryContextColumns<Context extends QueryContext<any>> =
  IsUnion<Keys<Context>> extends true
    ? TableColumns<Context>
    : {
        [Key in Keys<Context>]: `${Keys<Context[Key]> & string}`
      }[Keys<Context>]

type TableColumns<Context extends QueryContext<any>> = {
  [T in Keys<Context>]: {
    [C in Keys<Context[T]>]: [C] extends [UniqueColumns<Context>]
      ? `${C & string}`
      : `${T & string}.${C & string}`
  }[Keys<Context[T]>]
}[Keys<Context>]

type UniqueColumns<Context extends QueryContext<any>> = {
  [T in Keys<Context>]: Unique<keyof Context[T], OtherColumns<Context, T>>
}[Keys<Context>]

type Unique<
  Left extends string | number | symbol,
  Right extends string | number | symbol,
> = {
  [v in Left]: [v] extends [Right] ? never : v
}[Left]

type OtherColumns<
  Context extends QueryContext<any>,
  K extends keyof Context,
> = {
  [Key in Keys<Context>]: [Key] extends [K] ? never : keyof Context[Key]
}[Keys<Context>]

type ExtendedQueryContext<
  Context extends QueryContext<any>,
  TableName extends string,
  Table extends TableContext<TableName, any>,
> = Flatten<
  Context & { [key in TableName]: { [key in keyof Table]: Table[key] } }
>

type ExtendedTableContext<
  Table extends string,
  Context extends TableContext<Table, any>,
  Column extends string,
  Definition extends ColumnTypeDefinition<any>,
> = Flatten<
  Context & {
    [key in Column]: ColumnReference<Table, Column, Definition>
  }
>

/**
 * Helper for building query contexts
 */
export class QueryContextBuilder<Context extends QueryContext<any>> {
  static create() {
    return new QueryContextBuilder({})
  }

  private _context: Context
  constructor(context: Context) {
    this._context = context
  }

  add<Table extends string>(
    table: [Table] extends [keyof Context] ? never : Table,
  ) {
    ;(this._context as any)[table] = {}

    return new QueryTableContextBuilder(table, {}, this._context)
  }

  build(): Context {
    return this._context
  }
}

class QueryTableContextBuilder<
  Table extends string,
  Context extends TableContext<Table, any>,
  QContext extends QueryContext<any>,
> {
  private _table: Table
  private _context: Context
  private _queryContext: QContext

  get queryContext(): QueryContextBuilder<
    ExtendedQueryContext<QContext, Table, Context>
  > {
    const ctx = this._queryContext as unknown as ExtendedQueryContext<
      QContext,
      Table,
      Context
    >
    ctx[this._table] = this._context as any
    return new QueryContextBuilder(ctx)
  }

  constructor(table: Table, context: Context, queryContext: QContext) {
    this._table = table
    this._context = context
    this._queryContext = queryContext
  }

  add<Column extends string, Definition extends ColumnTypeDefinition<any>>(
    column: [Column] extends [keyof Context] ? never : Column,
    definition: Definition,
  ): QueryTableContextBuilder<
    Table,
    ExtendedTableContext<Table, Context, Column, Definition>,
    QContext
  > {
    const reference: ColumnReference<Table, Column, Definition> = {
      column: column,
      alias: column,
      definition: definition,
      table: this._table,
    }

    ;(this._context as any)[column] = reference

    return new QueryTableContextBuilder(
      this._table,
      this._context as unknown as ExtendedTableContext<
        Table,
        Context,
        Column,
        Definition
      >,
      this._queryContext,
    )
  }
}

/**
 * Information about a column that is referenced
 */
export type ColumnReference<
  Table extends string,
  Column extends string,
  ColumnDefinition extends ColumnTypeDefinition<any>,
  Alias extends string = Column,
> = {
  table: Table
  column: Column
  definition: ColumnDefinition
  alias: Alias
}

/**
 * Information about a table
 */
export type TableContext<Table extends string, Columns extends string> = {
  [key in Columns]: ColumnReference<
    Table,
    any,
    ColumnTypeDefinition<any>,
    key & string
  >
}

/**
 * The current context available for the query
 */
export type QueryContext<Tables extends string> = {
  [key in Tables]: TableContext<key & string, any>
}
