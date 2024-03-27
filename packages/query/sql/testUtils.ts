/**
 * Test utilities for verifying the SQL packages
 */

import { SchemaBuilder } from "./schema"
import { SQLColumnType } from "./types"

const Order = {
  id: SQLColumnType.BIGINT,
  name: SQLColumnType.TEXT,
  customerId: SQLColumnType.BIGINT,
  createdAt: SQLColumnType.TIMESTAMP,
  updatedAt: SQLColumnType.TIMESTAMP,
  amount: SQLColumnType.DECIMAL,
} as const

const Customer = {
  id: SQLColumnType.BIGINT,
  firstName: SQLColumnType.TEXT,
  lastName: SQLColumnType.TEXT,
  createdAt: SQLColumnType.TIMESTAMP,
} as const

export const TestDatabase = new SchemaBuilder()
  .withTable(Order, "orders", { column: "id" })
  .withTable(Customer, "customers", { column: "id" })
  .withForeignKey("orders", "customers", "customerId", "id")
  .build()
