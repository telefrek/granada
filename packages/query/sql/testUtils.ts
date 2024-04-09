/**
 * Test utilities for verifying the SQL packages
 */

import { ExecutionMode, type QueryResult, type RowType } from "../index"
import { SchemaBuilder } from "./schema/builder"
import type { SQLDatabaseSchema } from "./schema/index"
import { SQLColumnType, SQLColumnTypes } from "./types"

export const Category = {
  TEST: "test",
  PURCHASE: "purchase",
} as const

const Order = {
  id: SQLColumnTypes.of(SQLColumnType.BIGINT),
  name: SQLColumnTypes.of(SQLColumnType.TEXT),
  customerId: SQLColumnTypes.of(SQLColumnType.BIGINT),
  createdAt: SQLColumnTypes.of(SQLColumnType.TIMESTAMP),
  updatedAt: SQLColumnTypes.of(SQLColumnType.TIMESTAMP),
  amount: SQLColumnTypes.of(SQLColumnType.DECIMAL),
  categories: SQLColumnTypes.arrayOf(Category),
} as const

const Customer = {
  id: SQLColumnTypes.of(SQLColumnType.BIGINT),
  firstName: SQLColumnTypes.of(SQLColumnType.TEXT),
  lastName: SQLColumnTypes.of(SQLColumnType.TEXT),
  createdAt: SQLColumnTypes.of(SQLColumnType.TIMESTAMP),
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
