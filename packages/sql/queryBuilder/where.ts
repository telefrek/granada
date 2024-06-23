/**
 * Where query clause building
 */

import type { Flatten } from "@telefrek/type-utils"
import type {
  ColumnFilter,
  ColumnReference,
  CombinedQueryClause,
  FilteringOperation,
  LogicalExpression,
  LogicalTree,
  QueryClause,
  TableColumnReference,
  UnboundColumnReference,
  WhereClause,
} from "../ast.js"
import type { SQLDatabaseSchema } from "../schema.js"
import type { QueryAST } from "./common.js"
import {
  type ColumnType,
  type MatchingColumns,
  type QueryContext,
  type QueryContextColumns,
} from "./context.js"
import {
  buildColumnReference,
  parseValue,
  type BuildColumnReferences,
  type CheckValueType,
} from "./utils.js"

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

type Parameter<
  Value,
  Context extends QueryContext,
  Column,
> = Value extends `:${infer _}`
  ? Value
  : Value extends `$${infer _}`
    ? Value
    : ColumnType<Context, Column> | MatchingColumns<Context, Column>

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
  ): ColumnFilter<
    RefType<Column>,
    Op,
    CheckColumnRef<Value, QueryContextColumns<Context>>
  >
}

type CheckColumnRef<Value, Columns extends string> = Value extends Columns
  ? BuildColumnReferences<Value>
  : CheckValueType<Value>

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
  ): ColumnFilter<
    RefType<Column>,
    Op,
    CheckColumnRef<Value, QueryContextColumns<Context>>
  > {
    return buildFilter<Context, Column, Op, Value>(
      this._context,
      column,
      op,
      value as Value,
    ) as unknown as ColumnFilter<
      RefType<Column>,
      Op,
      CheckColumnRef<Value, QueryContextColumns<Context>>
    >
  }
}

function buildFilter<
  Context extends QueryContext,
  Column extends string,
  Operation extends FilteringOperation,
  Value,
>(
  context: Context,
  column: Column,
  op: Operation,
  value: Value,
): ColumnFilter<
  Column extends `${infer Table}.${infer Col}`
    ? ColumnReference<TableColumnReference<Table, Col>, Col>
    : ColumnReference<UnboundColumnReference<Column>, Column>,
  Operation,
  CheckColumnRef<Value, QueryContextColumns<Context>>
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
      : isColumn(context, value)
        ? buildColumnReference(value as string)
        : parseValue(value)) as CheckColumnRef<
      Value,
      QueryContextColumns<Context>
    >,
  }
}

function isColumn<Context extends QueryContext, Value>(
  context: Context,
  value: Value,
): boolean {
  if (typeof value === "string") {
    if (value.indexOf(".") > 0) {
      const data = value.split(".")
      if (Object.hasOwn(context.active, data[0])) {
        const table = Object.getOwnPropertyDescriptor(
          context.active,
          data[0],
        )?.value
        if (table !== undefined && Object.hasOwn(table["columns"], data[1])) {
          return true
        }
      }
    } else {
      for (const key of Object.keys(context.active)) {
        const table = Object.getOwnPropertyDescriptor(
          context.active,
          key,
        )?.value
        if (table !== undefined) {
          for (const col of Object.keys(table["columns"])) {
            if (col === value) {
              return true
            }
          }
        }
      }
    }
  }
  return false
}

function isParameter<T>(value: T): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith(":") || value.startsWith("$"))
  )
}
