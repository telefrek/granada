/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Flatten, StringKeys } from "@telefrek/type-utils"
import type { UnionToTuple } from "@telefrek/type-utils/unsafe.js"
import type {
  ColumnReference,
  LogicalExpression,
  SelectClause,
  SelectColumns,
  SelectedColumn,
  TableColumnReference,
  TableReference,
  UnboundColumnReference,
  WhereClause,
} from "../ast.js"
import {
  type ColumnTypeDefinition,
  type SQLColumnSchema,
  type SQLDatabaseSchema,
  type SQLDatabaseTables,
} from "../schema.js"
import type { SQLBuiltinTypes } from "../types.js"
import { type QueryContext, type QueryContextColumns } from "./context.js"
import type { getColumnType } from "./utils.js"
import { whereClause, type WhereClauseBuilder } from "./where.js"

/**
 * Template literal for allowing Column aliasing
 */
type ColumnAlias<C extends string> = `${C} AS ${string}`

/**
 * Check to ensure the alias has a valid string since {@link ColumnAlias} allows
 * "" as a valid string
 */
type CheckColumn<T> = T extends `${infer _} AS ${infer Alias}`
  ? Alias extends ""
    ? never
    : T
  : T

type ColumnDetails<Column extends string, Type extends SQLBuiltinTypes> = {
  column: Column
  type: Type
}

type MapColumns<
  Columns extends string,
  Active extends SQLDatabaseTables,
> = Columns extends `${infer Column} AS ${infer Alias}`
  ? getColumnType<Column, Active> extends SQLBuiltinTypes
    ? ColumnDetails<Alias, getColumnType<Column, Active>>
    : never
  : getColumnType<Columns, Active> extends SQLBuiltinTypes
    ? ColumnDetails<Columns, getColumnType<Columns, Active>>
    : never

type ToSchema<T, O = object> = T extends [infer Head, ...infer Rest]
  ? Rest extends never[]
    ? Head extends ColumnDetails<infer Column, infer Type>
      ? Flatten<O & { [key in Column]: ColumnTypeDefinition<Type> }>
      : never
    : Head extends ColumnDetails<infer Column, infer Type>
      ? ToSchema<
          Rest,
          Flatten<O & { [key in Column]: ColumnTypeDefinition<Type> }>
        >
      : never
  : never

/**
 * Type to manipulate the return type using the columns specified
 */
type ModifyReturn<Context, Columns extends string> =
  Context extends QueryContext<infer Database, infer Active, infer _>
    ? QueryContext<
        Database,
        Active,
        ToSchema<UnionToTuple<MapColumns<Columns, Active>>>
      >
    : never

export function createSelect<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables,
  Table extends StringKeys<Active>,
>(
  context: QueryContext<Database, Active>,
  table: Table,
): SelectBuilder<
  Database,
  Active,
  Table,
  QueryContext<Database, Active, Active[Table]["columns"]>,
  never,
  "*"
> {
  return new DefaultSelectBuilder(table, context)
}

type CheckSelect<Select, Where> =
  Select extends SelectClause<infer Columns, infer From>
    ? [Where] extends [never]
      ? SelectClause<Columns, From>
      : Where extends LogicalExpression
        ? Flatten<SelectClause<Columns, From> & WhereClause<Where>>
        : never
    : Select

type CheckColumns<Columns extends string> =
  UnionToTuple<ColumnsToSelect<Columns>> extends SelectedColumn[]
    ? BuildSelectColumns<UnionToTuple<ColumnsToSelect<Columns>>>
    : "*"

type BuildSelectColumns<Columns, O = object> = Columns extends [
  infer Head,
  ...infer Rest,
]
  ? Rest extends never[]
    ? Head extends ColumnReference<infer C, infer A>
      ? Flatten<O & { [key in A]: ColumnReference<C, A> }>
      : never
    : Head extends ColumnReference<infer C, infer A>
      ? BuildSelectColumns<
          Rest,
          Flatten<O & { [key in A]: ColumnReference<C, A> }>
        >
      : never
  : never

type ColumnsToSelect<Columns extends string> =
  Columns extends `${infer Column} AS ${infer Alias}`
    ? Column extends `${infer Table}.${infer Col}`
      ? ColumnReference<TableColumnReference<Table, Col>, Alias>
      : ColumnReference<UnboundColumnReference<Column>, Alias>
    : Columns extends `${infer Table}.${infer Col}`
      ? ColumnReference<TableColumnReference<Table, Col>>
      : ColumnReference<UnboundColumnReference<Columns>>

export interface SelectBuilder<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables,
  Table extends StringKeys<Active>,
  Context extends QueryContext<Database, Active, number | SQLColumnSchema>,
  Where extends LogicalExpression = never,
  SelectedColumns extends SelectColumns | "*" = SelectColumns | "*",
> {
  readonly ast: CheckSelect<
    SelectClause<SelectedColumns, TableReference<Table>>,
    Where
  >

  where<Exp extends LogicalExpression>(
    builder: (w: WhereClauseBuilder<Context>) => Exp,
  ): SelectBuilder<Database, Active, Table, Context, Exp, SelectedColumns>

  columns<
    Columns extends
      | QueryContextColumns<Context>
      | ColumnAlias<QueryContextColumns<Context>>,
  >(
    first: CheckColumn<Columns>,
    ...rest: CheckColumn<Columns>[]
  ): SelectBuilder<
    Database,
    Active,
    Table,
    ModifyReturn<Context, Columns>,
    Where,
    CheckColumns<Columns>
  >
}

class DefaultSelectBuilder<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables,
  Table extends StringKeys<Active>,
  Context extends QueryContext<Database, Active> = QueryContext<
    Database,
    Active,
    Active[Table]["columns"]
  >,
  Where extends LogicalExpression = never,
  SelectedColumns extends SelectColumns | "*" = SelectColumns | "*",
> implements SelectBuilder<Database, Active, Table, Context, Where>
{
  private _table: TableReference<Table>
  private _columns: SelectedColumns = "*" as any
  private _context: Context
  private _where?: LogicalExpression

  constructor(table: Table, context: Context) {
    this._table = {
      type: "TableReference",
      table,
      alias: table,
    }
    this._context = context
  }

  get ast(): CheckSelect<
    SelectClause<SelectedColumns, TableReference<Table>>,
    Where
  > {
    const select: SelectClause<SelectedColumns, TableReference<Table>> = {
      type: "SelectClause",
      columns: this._columns,
      from: this._table,
    }

    return (
      this._where !== undefined ? { ...select, where: this._where } : select
    ) as any
  }

  where<Exp extends LogicalExpression>(
    builder: (w: WhereClauseBuilder<Context>) => Exp,
  ): SelectBuilder<Database, Active, Table, Context, Exp, SelectedColumns> {
    this._where = builder(whereClause(this._context))
    return this as any
  }

  columns<
    Columns extends
      | QueryContextColumns<Context>
      | ColumnAlias<QueryContextColumns<Context>>,
  >(
    first: CheckColumn<Columns>,
    ...rest: CheckColumn<Columns>[]
  ): SelectBuilder<
    Database,
    Active,
    Table,
    ModifyReturn<Context, Columns>,
    Where,
    CheckColumns<Columns>
  > {
    const foo = [first, ...rest]
    if (foo === undefined) {
      throw new Error("nope")
    }
    return this as any
  }
}
