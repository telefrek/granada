/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Where query clause building
 */

import type {
  ArrayValueType,
  BigIntValueType,
  BooleanValueType,
  BufferValueType,
  ColumnFilter,
  ColumnReference,
  FilteringOperation,
  LogicalExpression,
  LogicalTree,
  NullValueType,
  NumberValueType,
  ParameterValueType,
  StringValueType,
  TableColumnReference,
  UnboundColumnReference,
} from "../ast.js"
import type { TableColumnType } from "../schema.js"
import { type QueryContext } from "./context.js"
import { buildColumnReference, parseValue } from "./utils.js"

type Keys<T extends QueryContext<any>> = {
  [K in keyof T]: keyof T[K]
}[keyof T]

type TableWithKey<T extends QueryContext<any>, N> = {
  [K in keyof T]: N extends keyof T[K] ? K : never
}[keyof T]

type IsUnion<T, U extends T = T> = (
  T extends any ? (U extends T ? false : true) : never
) extends false
  ? false
  : true

type UniqueKeys<T extends QueryContext<any>> = {
  [K in Keys<T>]: IsUnion<TableWithKey<T, K>> extends true ? never : K
}[Keys<T>]

type TT<T extends QueryContext<any>, C> = {
  [K in TableWithKey<T, C>]: C extends keyof T[K]
    ? TableColumnType<T[K][C]["definition"]>
    : never
}[TableWithKey<T, C>]

export type Parameter<
  V,
  T extends QueryContext<any>,
  C,
> = V extends `:${infer _}` ? V : V extends `$${infer _}` ? V : TT<T, C>

export interface WhereClauseBuilder<Context extends QueryContext<any>> {
  and<Left extends LogicalExpression, Right extends LogicalExpression>(
    left: Left,
    right: Right,
  ): LogicalTree<Left, "AND", Right>

  eq<Column extends Extract<UniqueKeys<Context>, string>, Value>(
    column: Column,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<UnboundColumnReference<Column>>,
    "=",
    CheckValueType<Value>
  >

  eq<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "=",
    CheckValueType<Value>
  >

  neq<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "!=",
    CheckValueType<Value>
  >

  gt<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    ">",
    CheckValueType<Value>
  >

  gte<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    ">=",
    CheckValueType<Value>
  >

  lt<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "<",
    CheckValueType<Value>
  >

  lte<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "<=",
    CheckValueType<Value>
  >
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

  and<Left extends LogicalExpression, Right extends LogicalExpression>(
    left: Left,
    right: Right,
  ): LogicalTree<Left, "AND", Right> {
    return {
      type: "LogicalTree",
      left,
      op: "AND",
      right,
    }
  }

  eq<Column extends Extract<UniqueKeys<Context>, string>, Value>(
    column: Column,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<UnboundColumnReference<Column>>,
    "=",
    CheckValueType<Value>
  >
  eq<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "=",
    CheckValueType<Value>
  >
  eq<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table | Parameter<Value, Context, Column>,
    value?: Parameter<Value, Context, Column>,
  ):
    | ColumnFilter<
        ColumnReference<UnboundColumnReference<Column>>,
        "=",
        CheckValueType<Value>
      >
    | ColumnFilter<
        ColumnReference<TableColumnReference<Table, Column>>,
        "=",
        CheckValueType<Value>
      > {
    // There is only a column
    if (value === undefined) {
      return buildFilter1(
        column,
        "=",
        table as Parameter<Value, Context, Column>,
      ) as ColumnFilter<
        ColumnReference<UnboundColumnReference<Column>>,
        "=",
        CheckValueType<Value>
      >
    }

    return buildFilter(
      column,
      table as Table,
      "=",
      value as Parameter<Value, Context, Column>,
    ) as ColumnFilter<
      ColumnReference<TableColumnReference<Table, Column>>,
      "=",
      CheckValueType<Value>
    >
  }

  gte<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    ">=",
    CheckValueType<Value>
  > {
    return buildFilter(column, table, "=", value) as any
  }

  gt<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    ">",
    CheckValueType<Value>
  > {
    return buildFilter(column, table, "=", value) as any
  }

  lt<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "<",
    CheckValueType<Value>
  > {
    return buildFilter(column, table, "=", value) as any
  }

  lte<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "<=",
    CheckValueType<Value>
  > {
    return buildFilter(column, table, "=", value) as any
  }

  neq<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "!=",
    CheckValueType<Value>
  > {
    return buildFilter(column, table, "=", value) as any
  }
}

function buildFilter1<
  Column extends string,
  Operation extends FilteringOperation,
  Value,
>(
  column: Column,
  op: Operation,
  value: Value,
): ColumnFilter<
  ColumnReference<UnboundColumnReference<Column>>,
  Operation,
  CheckValueType<Value>
> {
  return {
    type: "ColumnFilter",
    left: buildColumnReference(column),
    op,
    right: (isParameter(value)
      ? {
          type: "ParameterValue",
          name: String(value).substring(1),
        }
      : parseValue(value)) as CheckValueType<Value>,
  }
}

function buildFilter<
  Column extends string,
  Table extends string,
  Operation extends FilteringOperation,
  Value,
>(
  column: Column,
  table: Table,
  op: Operation,
  value: Value,
): ColumnFilter<
  ColumnReference<TableColumnReference<Table, Column>>,
  Operation,
  CheckValueType<Value>
> {
  return {
    type: "ColumnFilter",
    left: buildColumnReference(column, table),
    op,
    right: (isParameter(value)
      ? {
          type: "ParameterValue",
          name: String(value).substring(1),
        }
      : parseValue(value)) as CheckValueType<Value>,
  }
}

function isParameter<T>(value: T): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith(":") || value.startsWith("$"))
  )
}

type CheckValueType<T> = T extends number
  ? NumberValueType<T>
  : T extends bigint
    ? BigIntValueType<T>
    : T extends boolean
      ? BooleanValueType<T>
      : T extends [null]
        ? NullValueType
        : T extends Int8Array
          ? BufferValueType<T>
          : T extends []
            ? ArrayValueType<T>
            : T extends string
              ? T extends `:${infer _}`
                ? ParameterValueType<_>
                : T extends `$${infer _}`
                  ? ParameterValueType<_>
                  : StringValueType<T>
              : never
