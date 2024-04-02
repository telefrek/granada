/**
 * Test utilities for verifying the SQL packages
 */

import { ExecutionMode, type QueryResult, type RowType } from "../index"
import { SchemaBuilder } from "./schema/builder"
import type { SQLDatabaseSchema } from "./schema/index"
import {
  SQLColumnType,
  type BaseColumnDefinition,
  type ColumnDefinition,
  type IncrementalColumnDefinition,
  type IncrementalSQLTypes,
  type ValidSQLTypes,
  type VariableColumnDefinition,
  type VariableSQLTypes,
} from "./types"

export const Category = {
  TEST: "test",
  PURCHASE: "purchase",
} as const

export class SQLColumnTypes {
  static base = <T extends ValidSQLTypes>(type: T): BaseColumnDefinition<T> => {
    return {
      type,
    }
  }

  static variable = <T extends VariableSQLTypes>(
    type: T,
    maxSize?: number,
  ): VariableColumnDefinition<T> => {
    return {
      type,
      size: maxSize ?? -1,
    }
  }

  static incremental = <T extends IncrementalSQLTypes>(
    type: T,
    autoIncrement?: boolean,
  ): IncrementalColumnDefinition<T> => {
    return {
      type,
      autoIncrement: autoIncrement ?? true,
    }
  }

  static arrayOf = <T extends ValidSQLTypes>(
    definition: ColumnDefinition<T> | T,
  ): ColumnDefinition<T>[] => {
    return [
      typeof definition === "object"
        ? (definition as ColumnDefinition<T>)
        : (SQLColumnTypes.base(definition) as ColumnDefinition<T>),
    ]
  }
}

const Order = {
  id: SQLColumnTypes.base(SQLColumnType.BIGINT),
  name: SQLColumnTypes.base(SQLColumnType.TEXT),
  customerId: SQLColumnTypes.base(SQLColumnType.BIGINT),
  createdAt: SQLColumnTypes.base(SQLColumnType.TIMESTAMP),
  updatedAt: SQLColumnTypes.base(SQLColumnType.TIMESTAMP),
  amount: SQLColumnTypes.base(SQLColumnType.DECIMAL),
  categories: SQLColumnTypes.arrayOf(Category),
} as const

const Customer = {
  id: SQLColumnTypes.base(SQLColumnType.BIGINT),
  firstName: SQLColumnTypes.base(SQLColumnType.TEXT),
  lastName: SQLColumnTypes.base(SQLColumnType.TEXT),
  createdAt: SQLColumnTypes.base(SQLColumnType.TIMESTAMP),
} as const

export const TestDatabase = new SchemaBuilder()
  .withTable(Order, "orders", { column: "id" })
  .withTable(Customer, "customers", { column: "id" })
  .withForeignKey("orders", "customers", "customerId", "id")
  .build()

export type TestDatabaseType = SQLDatabaseSchema<typeof TestDatabase>

export function getRows<T extends RowType>(result: QueryResult<T>): T[] {
  return result.mode === ExecutionMode.Normal ? result.rows : []
}
