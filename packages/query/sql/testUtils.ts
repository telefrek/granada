/**
 * Test utilities for verifying the SQL packages
 */

import type { SQLDatabase, SQLTableDefinition } from "./schema"
import { SQLColumnType } from "./types"

const Order = {
  id: SQLColumnType.BIGINT,
  name: SQLColumnType.TEXT,
} as const

const OrderTable: SQLTableDefinition<typeof Order> = {
  columns: Order,
  key: {
    column: "id",
  },
  defaults: {
    name: "test",
  },
}

type TestDatabaseTables = {
  orders: SQLTableDefinition<typeof Order>
}

export const TestDatabase: SQLDatabase<TestDatabaseTables> = {
  tables: {
    orders: OrderTable,
  },
  relations: [
    {
      right: "orders",
      left: "orders",
      leftColumn: "id",
      rightColumn: "id",
    },
  ],
}
