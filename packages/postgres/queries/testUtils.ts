import type {
  PostgresArray,
  PostgresColumnTypeName,
  PostgresColumnTypes,
  PostgresDatabase,
  PostgresEnum,
} from "../"

import pg from "pg"

export const Category = {
  TEST: "test",
  PURCHASE: "purchase",
} as const

type Table = Record<string, PostgresColumnTypes | undefined>

export interface Order extends Table {
  id: PostgresColumnTypeName.SERIAL
  createdAt: PostgresColumnTypeName.BIGINT
  updatedAt: PostgresColumnTypeName.BIGINT
  removedAt?: PostgresColumnTypeName.BIGINT
  name: PostgresColumnTypeName.TEXT
  categories: PostgresArray<PostgresEnum<typeof Category>>
  amount: PostgresColumnTypeName.REAL
  customerId: PostgresColumnTypeName.INTEGER
}

export interface Customer extends Table {
  id: PostgresColumnTypeName.SERIAL
  createdAt: PostgresColumnTypeName.BIGINT
  updatedAt: PostgresColumnTypeName.BIGINT
  removedAt?: PostgresColumnTypeName.BIGINT
  firstName: PostgresColumnTypeName.TEXT
  lastName: PostgresColumnTypeName.TEXT
}

export interface TestDatabase extends PostgresDatabase {
  tables: {
    orders: {
      schema: Order
    }
    customers: {
      schema: Customer
    }
  }
}

export async function createTestDatabase(client: pg.Client): Promise<void> {
  await client.query(`
        CREATE TYPE Category AS ENUM('test', 'purchase')
    `)
  await client.query(`
        CREATE TABLE customers(
            id serial PRIMARY KEY,
            createdAt bigint NOT NULL,
            updatedAt bigint NOT NULL,
            removedAt bigint,
            firstName text NOT NULL,
            lastName text NOT NULL
        )`)

  await client.query(`
        CREATE TABLE orders(
            id serial PRIMARY KEY,
            createdAt bigint NOT NULL,
            updatedAt bigint NOT NULL,
            removedAt bigint,
            categories Category[] NOT NULL,
            amount real NOT NULL,
            customerId integer NOT NULL
        )
    `)
}
