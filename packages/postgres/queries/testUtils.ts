import { SchemaBuilder } from "@telefrek/query/sql/schema/builder"
import type { SQLDatabaseSchema } from "@telefrek/query/sql/schema/index"
import { SQLColumnType } from "@telefrek/query/sql/types"
import pg from "pg"

/**
 * Test utilities for verifying the SQL packages
 */

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
  updatedAt: {
    type: SQLColumnType.TIMESTAMP,
  },
} as const

export const TestDatabase = new SchemaBuilder()
  .withTable(Order, "orders", { column: "id" })
  .withTable(Customer, "customers", { column: "id" })
  .withForeignKey("orders", "customers", "customerId", "id")
  .build()

export type TestDatabaseType = SQLDatabaseSchema<typeof TestDatabase>

export async function createTestDatabase(client: pg.Client): Promise<void> {
  await client.query(`
        CREATE TYPE Category AS ENUM('test', 'purchase')
    `)
  await client.query(`
        CREATE TABLE customers(
            id serial PRIMARY KEY,
            createdAt bigint NOT NULL,
            updatedAt bigint NOT NULL,
            firstName text NOT NULL,
            lastName text NOT NULL
        )`)

  await client.query(`
        CREATE TABLE orders(
            id serial PRIMARY KEY,
            createdAt bigint NOT NULL,
            updatedAt bigint NOT NULL,
            categories Category[] NOT NULL,
            amount real NOT NULL,
            customerId integer NOT NULL
        )
    `)
}
