/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SQLTable } from "./schema.js"

/**
 * The building blocks for our SQL AST structure
 *
 * NOTE: All AST have a reference back to a schema, otherwise they wouldn't
 * necessarily be available to validate via the type system.
 */

/**
 * The set of value types supported
 */
export type ValueTypes =
  | BooleanValueType
  | NumberValueType
  | BigIntValueType
  | BufferValueType
  | NullValueType
  | StringValueType
  | JsonValueType
  | ArrayValueType
  | ParameterValueType
  | ColumnReferenceType<any>

export type ColumnReferenceType<
  Table extends SQLTable,
  Column extends keyof Table["columns"] = keyof Table["columns"],
> = {
  type: "ColumnReference"
  table: Table
  column: Column
}

export type ParameterValueType<Name extends string = string> = {
  type: "ParameterValue"
  name: Name
}

export type BooleanValueType<B extends boolean = boolean> = {
  type: "BooleanValue"
  value: B
}

export type NumberValueType<N extends number = number> = {
  type: "NumberValue"
  value: N
}

export type BigIntValueType<B extends number | bigint = bigint> = {
  type: "BigIntValue"
  value: B
}

export type BufferValueType<B extends Int8Array = Int8Array> = {
  type: "BufferValue"
  value: B
}

export type StringValueType<S extends string = string> = {
  type: "StringValue"
  value: S
}

export type NullValueType = {
  type: "NullValue"
  value: null
}

export type JsonValueType<J extends object = object> = {
  type: "JsonValue"
  value: J
}

export type ArrayValueType<A extends [] = []> = {
  type: "ArrayValue"
  value: A
}

export type FilteringOperation =
  | "="
  | "<"
  | ">"
  | "<="
  | ">="
  | "!="
  | "LIKE"
  | "ILIKE"

export type BooleanOperation = "AND" | "OR" | "NOT" | "!" | "&&" | "||"

export type FilteringExpression<
  Left extends ExpressionTree = ExpressionTree,
  Operation extends FilteringOperation = FilteringOperation,
  Right extends ExpressionTree = ExpressionTree,
> = {
  left: Left
  op: Operation
  right: Right
}

export type BooleanExpression<
  Left extends ExpressionTree = ExpressionTree,
  Operation extends BooleanOperation = BooleanOperation,
  Right extends ExpressionTree = ExpressionTree,
> = {
  left: Left
  op: Operation
  right: Right
}

export type ExpressionTree =
  | ValueTypes
  | BooleanExpression<any, BooleanOperation, any>
  | FilteringExpression<any, FilteringOperation, any>

export type WhereClause = ExpressionTree
