import type { StringKeys } from "@telefrek/type-utils"
import type {
  ArrayValueType,
  BigIntValueType,
  BooleanValueType,
  BufferValueType,
  ColumnReference,
  NullValueType,
  NumberValueType,
  ParameterValueType,
  StringValueType,
  TableColumnReference,
  UnboundColumnReference,
  ValueTypes,
} from "../ast.js"
import type { CheckTableReference } from "../parsing/tables.js"
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

export type CheckValueType<T> = T extends number
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

export type ColumnReferenceType<Column extends string> =
  Column extends `${infer C} AS ${infer Alias}`
    ? C extends `${infer Table}.${infer Col}`
      ? ColumnReference<TableColumnReference<Table, Col>, Alias>
      : ColumnReference<UnboundColumnReference<C>, Alias>
    : Column extends `${infer Table}.${infer Col}`
      ? ColumnReference<TableColumnReference<Table, Col>>
      : ColumnReference<UnboundColumnReference<Column>>

const ALIAS_REGEX = /(.)+ AS (.)+/
const TABLE_BOUND_REGEX = /([^.])+\.([^.])+/

export function buildTableReference<Table extends string>(
  table: Table,
): CheckTableReference<Table> {
  if (ALIAS_REGEX.test(table)) {
    const data = table.split(" AS ")
    return {
      type: "TableReference",
      table: data[0],
      alias: data[1],
    } as CheckTableReference<Table>
  }

  return {
    type: "TableReference",
    table,
    alias: table,
  } as unknown as CheckTableReference<Table>
}

export function buildColumnReference<Column extends string>(
  column: Column,
): ColumnReferenceType<Column> {
  if (ALIAS_REGEX.test(column)) {
    const data = column.split(" AS ")

    const ref = TABLE_BOUND_REGEX.test(data[0])
      ? (splitColumn(data[0]) as unknown as ColumnReferenceType<Column>)
      : (unboundColumn(data[0]) as unknown as ColumnReferenceType<Column>)

    ref["alias"] = data[1]
    return ref
  }

  return TABLE_BOUND_REGEX.test(column)
    ? (splitColumn(column) as unknown as ColumnReferenceType<Column>)
    : (unboundColumn(column) as unknown as ColumnReferenceType<Column>)
}

function unboundColumn<Column extends string>(
  column: Column,
): ColumnReference<UnboundColumnReference<Column>> {
  return {
    type: "ColumnReference",
    reference: {
      type: "UnboundColumnReference",
      column,
    },
    alias: column,
  }
}

type SplitColumnType<Column extends string> =
  Column extends `${infer Table}.${infer Col}`
    ? ColumnReference<TableColumnReference<Table, Col>>
    : never

function splitColumn<Column extends string>(
  column: Column,
): SplitColumnType<Column> {
  const data = column.split(".")
  return {
    type: "ColumnReference",
    reference: {
      type: "TableColumnReference",
      table: data[0],
      column: data[1],
    },
    alias: data[1],
  } as unknown as SplitColumnType<Column>
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
