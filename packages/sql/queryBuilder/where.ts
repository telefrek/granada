/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Where query clause building
 */

import type { Keys } from "@telefrek/type-utils"
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
import { type QueryContext, type QueryContextColumns } from "./context.js"
import { buildColumnReference, parseValue } from "./utils.js"

type ColumnType<
  T extends QueryContext<any>,
  C,
> = C extends `${infer Table}.${infer Column}`
  ? TableColumnType<T[Table][Column]["definition"]>
  : {
      [Key in Keys<T>]: C extends keyof T[Key]
        ? TableColumnType<T[Key][C]["definition"]>
        : never
    }[Keys<T>]

export type Parameter<
  V,
  T extends QueryContext<any>,
  C,
> = V extends `:${infer _}` ? V : V extends `$${infer _}` ? V : ColumnType<T, C>

type RefType<C extends string> = C extends `${infer Table}.${infer Column}`
  ? ColumnReference<TableColumnReference<Table, Column>>
  : ColumnReference<UnboundColumnReference<C>>

export interface WhereClauseBuilder<Context extends QueryContext<any>> {
  and<Left extends LogicalExpression, Right extends LogicalExpression>(
    left: Left,
    right: Right,
  ): LogicalTree<Left, "AND", Right>

  filter<
    Column extends QueryContextColumns<Context>,
    Op extends FilteringOperation,
    Value,
  >(
    column: Column,
    op: Op,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<RefType<Column>, Op, CheckValueType<Value>>
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

  filter<
    Column extends QueryContextColumns<Context>,
    Op extends FilteringOperation,
    Value,
  >(
    column: Column,
    op: Op,
    value: Parameter<Value, Context, Column>,
  ): ColumnFilter<RefType<Column>, Op, CheckValueType<Value>> {
    return buildFilter<Column, Op, Value>(column, op, value as Value) as any
  }
}

function buildFilter<
  Column extends string,
  Operation extends FilteringOperation,
  Value,
>(
  column: Column,
  op: Operation,
  value: Value,
): ColumnFilter<
  Column extends `${infer Table}.${infer Col}`
    ? ColumnReference<TableColumnReference<Table, Col>>
    : ColumnReference<UnboundColumnReference<Column>>,
  Operation,
  CheckValueType<Value>
> {
  const data = column.split(".")
  return {
    type: "ColumnFilter",
    left:
      data.length > 1
        ? buildColumnReference(data[1], data[0])
        : (buildColumnReference(column) as any),
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
