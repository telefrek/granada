/**
 * Where query clause building
 */

import type { Flatten, Keys } from "@telefrek/type-utils"
import type {
  ArrayValueType,
  BigIntValueType,
  BooleanValueType,
  BufferValueType,
  ColumnFilter,
  ColumnReference,
  CombinedQueryClause,
  FilteringOperation,
  LogicalExpression,
  LogicalTree,
  NullValueType,
  NumberValueType,
  ParameterValueType,
  QueryClause,
  StringValueType,
  TableColumnReference,
  UnboundColumnReference,
  WhereClause,
} from "../ast.js"
import type { SQLDatabaseSchema, TableColumnType } from "../schema.js"
import type { QueryAST } from "./common.js"
import { type QueryContext, type QueryContextColumns } from "./context.js"
import { buildColumnReference, parseValue } from "./utils.js"

export interface WhereBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Query extends QueryClause | CombinedQueryClause,
  Next extends QueryAST<Query>,
> extends QueryAST<Query> {
  /**
   *
   */
  where<Exp extends LogicalExpression>(
    builder: (w: WhereClauseBuilder<Context>) => Exp,
  ): AddWhereToAST<Next, Exp>
}

export type AddWhereToAST<
  Next extends QueryAST,
  Exp extends LogicalExpression,
> =
  Next extends QueryAST<infer Query>
    ? Flatten<Query & WhereClause<Exp>> extends QueryClause
      ? QueryAST<Flatten<Query & WhereClause<Exp>>>
      : never
    : never

type ColumnType<Context extends QueryContext, Column> =
  Context extends QueryContext<infer _Database, infer Active, infer _Returning>
    ? Column extends `${infer Table}.${infer Column}`
      ? TableColumnType<Active[Table]["columns"][Column]>
      : {
          [Key in Keys<Active>]: Column extends keyof Active[Key]["columns"]
            ? TableColumnType<Active[Key]["columns"][Column]>
            : never
        }[Keys<Active>]
    : never

type Parameter<
  Value,
  Context extends QueryContext,
  Column,
> = Value extends `:${infer _}`
  ? Value
  : Value extends `$${infer _}`
    ? Value
    : ColumnType<Context, Column>

type RefType<C extends string> = C extends `${infer Table}.${infer Column}`
  ? ColumnReference<TableColumnReference<Table, Column>>
  : ColumnReference<UnboundColumnReference<C>>

export interface WhereClauseBuilder<Context extends QueryContext> {
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

export function whereClause<Context extends QueryContext>(
  context: Context,
): WhereClauseBuilder<Context> {
  return new DefaultWhereClauseBuilder(context)
}

class DefaultWhereClauseBuilder<Context extends QueryContext>
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
    return buildFilter<Column, Op, Value>(
      column,
      op,
      value as Value,
    ) as unknown as ColumnFilter<RefType<Column>, Op, CheckValueType<Value>>
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
    ? ColumnReference<TableColumnReference<Table, Col>, Col>
    : ColumnReference<UnboundColumnReference<Column>, Column>,
  Operation,
  CheckValueType<Value>
> {
  return {
    type: "ColumnFilter",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    left: buildColumnReference(column) as any,
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
