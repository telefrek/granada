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
    nullable: false,
  },
  name: {
    type: SQLColumnType.TEXT,
    nullable: false,
  },
  customerId: {
    type: SQLColumnType.BIGINT,
    nullable: false,
  },
  createdAt: {
    type: SQLColumnType.TIMESTAMP,
    nullable: false,
  },
  updatedAt: {
    type: SQLColumnType.TIMESTAMP,
    nullable: false,
  },
  amount: {
    type: SQLColumnType.DECIMAL,
    nullable: false,
  },
  categories: {
    type: {
      itemType: Category,
    },
    nullable: false,
  },
} as const

const Customer = {
  id: {
    type: SQLColumnType.BIGINT,
    nullable: false,
  },
  firstName: {
    type: SQLColumnType.TEXT,
    nullable: false,
  },
  lastName: {
    type: SQLColumnType.TEXT,
    nullable: false,
  },
  createdAt: {
    type: SQLColumnType.TIMESTAMP,
    nullable: false,
  },
} as const

export const TestDatabase = new SchemaBuilder()
  .withTable(Order, "orders", { column: "id" })
  .withTable(Customer, "customers", { column: "id" })
  .withForeignKey("orders", "customers", "customerId", "id")
  .build()

export type TestDatabaseType = SQLDatabaseSchema<typeof TestDatabase>
