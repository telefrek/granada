import type { StringKeys } from "@telefrek/type-utils"
import type {
  ColumnReference,
  TableColumnReference,
  UnboundColumnReference,
  ValueTypes,
} from "../ast.js"
import type { SQLDatabaseTables } from "../schema.js"

export function deepCopy<T, U = T extends Array<infer V> ? V : never>(
  source: T,
): T {
  if (Array.isArray(source)) {
    return source.map((item) => deepCopy(item)) as T & U[]
  }
  if (source instanceof Date) {
    return new Date(source.getTime()) as T & Date
  }
  if (source && typeof source === "object") {
    return (Object.getOwnPropertyNames(source) as (keyof T)[]).reduce<T>(
      (o, prop) => {
        Object.defineProperty(o, prop, {
          ...Object.getOwnPropertyDescriptor(source, prop)!,
          value: deepCopy(source[prop]),
        })
        return o
      },
      Object.create(Object.getPrototypeOf(source)),
    )
  }
  return source
}

export type AliasedValue<C extends string> = `${C} AS ${string}`

export type BuildColumnReferences<Columns extends string> =
  Columns extends `${infer Column} AS ${infer Alias}`
    ? Column extends `${infer Table}.${infer Col}`
      ? ColumnReference<TableColumnReference<Table, Col>, Alias>
      : ColumnReference<UnboundColumnReference<Column>, Alias>
    : Columns extends `${infer Table}.${infer Col}`
      ? ColumnReference<TableColumnReference<Table, Col>>
      : ColumnReference<UnboundColumnReference<Columns>>

/**
 * Extract the column type from a column or table.column reference pair
 */
export type getColumnType<
  Column extends string,
  Tables extends SQLDatabaseTables,
> = Column extends `${infer Table}.${infer Col}`
  ? Table extends StringKeys<Tables>
    ? Col extends StringKeys<Tables[Table]["columns"]>
      ? Tables[Table]["columns"][Col]["type"]
      : never
    : never
  : GetUniqueColumn<Column, Tables>

type GetUniqueColumn<
  Column extends string,
  Tables extends SQLDatabaseTables,
> = {
  [Table in StringKeys<Tables>]: Column extends StringKeys<
    Tables[Table]["columns"]
  >
    ? Tables[Table]["columns"][Column]["type"]
    : never
}[StringKeys<Tables>]

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
