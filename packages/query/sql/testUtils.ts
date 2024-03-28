/**
 * Test utilities for verifying the SQL packages
 */

import { SchemaBuilder } from "./schema/builder"
import type { SQLDatabaseSchema } from "./schema/index"
import { SQLColumnType } from "./types"

export const Category = {
  TEST: "test",
  PURCHASE: "purchase",
} as const

const Order = {
  id: {
    type: SQLColumnType.BIGINT,
  },
  name: {
    type: SQLColumnType.TEXT,
  },
  customerId: {
    type: SQLColumnType.BIGINT,
  },
  createdAt: {
    type: SQLColumnType.TIMESTAMP,
    nullable: true,
  },
  updatedAt: {
    type: SQLColumnType.TIMESTAMP,
  },
  amount: {
    type: SQLColumnType.DECIMAL,
  },
  categories: {
    type: Category,
    isArray: true,
  },
} as const

const Customer = {
  id: {
    type: SQLColumnType.BIGINT,
  },
  firstName: {
    type: SQLColumnType.TEXT,
  },
  lastName: {
    type: SQLColumnType.TEXT,
  },
  createdAt: {
    type: SQLColumnType.TIMESTAMP,
  },
} as const

export const TestDatabase = new SchemaBuilder()
  .withTable(Order, "orders", { column: "id" })
  .withTable(Customer, "customers", { column: "id" })
  .withForeignKey("orders", "customers", "customerId", "id")
  .build()

export type TestDatabaseType = SQLDatabaseSchema<typeof TestDatabase>
