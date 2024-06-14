import type {
  ColumnReference,
  TableColumnReference,
  UnboundColumnReference,
  ValueTypes,
} from "../ast.js"

export function buildColumnReference<Column extends string>(
  column: Column,
): ColumnReference<UnboundColumnReference<Column>>
export function buildColumnReference<
  Column extends string,
  Table extends string,
>(
  column: Column,
  table: Table,
): ColumnReference<TableColumnReference<Table, Column>>
export function buildColumnReference<
  Column extends string,
  Table extends string,
>(
  column: Column,
  table?: Table,
):
  | ColumnReference<UnboundColumnReference<Column>>
  | ColumnReference<TableColumnReference<Table, Column>> {
  if (table !== undefined) {
    return {
      type: "ColumnReference",
      reference: {
        type: "TableColumnReference",
        table,
        column,
      },
      alias: column,
    }
  }

  return {
    type: "ColumnReference",
    reference: {
      type: "UnboundColumnReference",
      column,
    },
    alias: column,
  }
}

export function parseValue<T>(value: T): ValueTypes {
  switch (typeof value) {
    case "bigint":
      return {
        type: "BigIntValue",
        value,
      }
    case "number":
      return {
        type: "NumberValue",
        value,
      }
    case "boolean":
      return {
        type: "BooleanValue",
        value,
      }
    case "string":
      return {
        type: "StringValue",
        value,
      }
    case "object":
      if (value instanceof Int8Array) {
        return {
          type: "BufferValue",
          value,
        }
      } else if (value === null) {
        return {
          type: "NullValue",
          value: null,
        }
      } else if (value === undefined) {
        throw new Error(`Cannot have undefined`)
      } else if (Array.isArray(value)) {
        return {
          type: "ArrayValue",
          value: value,
        }
      } else {
        return {
          type: "JsonValue",
          value,
        }
      }
  }

  throw new Error("Cannot parse value")
}
