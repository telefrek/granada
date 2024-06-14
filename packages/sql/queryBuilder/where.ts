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
  NullValueType,
  NumberValueType,
  ParameterValueType,
  StringValueType,
  TableColumnReference,
  ValueTypes,
} from "../ast.js"
import type { CheckFilter } from "../parsing/where.js"
import type { TableColumnType } from "../schema.js"
import { type QueryContext } from "./context.js"
import { buildColumnReference, parseValue } from "./utils.js"

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
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column, Table>,
  ): CheckFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "=",
    CheckValueType<Parameter<Value, Context, Column, Table>>
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

  eq<
    Column extends Extract<Keys<Context>, string>,
    Table extends Extract<TableWithKey<Context, Column>, string>,
    Value,
  >(
    column: Column,
    table: Table,
    value: Parameter<Value, Context, Column, Table>,
  ): CheckFilter<
    ColumnReference<TableColumnReference<Table, Column>>,
    "=",
    CheckValueType<Parameter<Value, Context, Column, Table>>
  > {
    return buildFilter(column, table, "=", value) as CheckFilter<
      ColumnReference<TableColumnReference<Table, Column>>,
      "=",
      CheckValueType<Parameter<Value, Context, Column, Table>>
    >
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
  ValueTypes
> {
  return {
    type: "ColumnFilter",
    left: buildColumnReference(column, table),
    op,
    right: isParameter(value)
      ? {
          type: "ParameterValue",
          name: String(value).substring(1),
        }
      : parseValue(value),
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
