import { and, containsItems, gt } from "@telefrek/data/relational/builder"
import {
  PostgresArray,
  PostgresColumnTypeName,
  PostgresEnum,
  type PostgresDatabase,
} from "../index"
import {
  PostgresQueryBuilder,
  createRelationalQueryContext,
  isPostgresRelationalQuery,
} from "./builder"

const Category = {
  TEST: "test",
  PURCHASE: "purchase",
} as const

type Order = {
  id: PostgresColumnTypeName.SERIAL
  createdAt: PostgresColumnTypeName.BIGINT
  updatedAt: PostgresColumnTypeName.BIGINT
  removedAt?: PostgresColumnTypeName.BIGINT
  name: PostgresColumnTypeName.TEXT
  categories: PostgresArray<PostgresEnum<typeof Category>>
  amount: PostgresColumnTypeName.REAL
  customerId: PostgresColumnTypeName.INTEGER
}

type Customer = {
  id: PostgresColumnTypeName.SERIAL
  createdAt: PostgresColumnTypeName.BIGINT
  updatedAt: PostgresColumnTypeName.BIGINT
  removedAt?: PostgresColumnTypeName.BIGINT
  firstName: PostgresColumnTypeName.TEXT
  lastName: PostgresColumnTypeName.TEXT
}

interface TestDatabase extends PostgresDatabase {
  tables: {
    orders: {
      schema: Order
    }
    customers: {
      schema: Customer
    }
  }
}

describe("Postgres query syntax should be translated correctly", () => {
  it("Should create a valid query from a builder", () => {
    const context = createRelationalQueryContext<TestDatabase>()
    const query = context
      .from("orders")
      .select("id", "categories")
      .alias("id", "orderId")
      .where(containsItems("categories", "purchase"))
      .build(PostgresQueryBuilder, "testQuery")

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "SELECT id AS orderId, categories FROM orders WHERE 'purchase'=ANY(categories)",
      )
    }
  })

  it("Should create a valid query from a builder with a cte and join", () => {
    const context = createRelationalQueryContext<TestDatabase>()
    const query = context
      .withCte("customerOrders", (builder) =>
        builder
          .from("orders")
          .select("id", "categories", "amount")
          .alias("id", "orderId")
          .where(gt("amount", 0))
          .join(
            "customers",
            (customers) =>
              customers.select("firstName", "lastName", "createdAt"),
            "customerId",
            "id",
          ),
      )
      .from("customerOrders")
      .select("*")
      .build(PostgresQueryBuilder, "testQuery")

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "WITH customerOrders AS (SELECT customers.createdAt, customers.firstName, customers.lastName, orders.amount, orders.categories, orders.id AS orderId FROM orders JOIN customers ON orders.customerId = customers.id WHERE orders.amount > 0) SELECT * FROM customerOrders",
      )
    }
  })

  it("Should create a valid query for multiple cte and a join in the main query", async () => {
    const query = createRelationalQueryContext<TestDatabase>()
      .withCte("customerOrders", (builder) =>
        builder
          .from("orders")
          .select("id", "customerId", "categories", "amount")
          .alias("id", "orderId")
          .where(and(gt("amount", 0), containsItems("categories", "test"))),
      )
      .withCte("customerNames", (builder) =>
        builder.from("customers").select("id", "firstName", "lastName"),
      )
      .from("customerOrders")
      .select("orderId", "amount", "categories")
      .join(
        "customerNames",
        (customerNames) => customerNames.select("firstName", "lastName"),
        "customerId",
        "id",
      )
      .build(PostgresQueryBuilder, "testQuery")

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "WITH customerOrders AS (SELECT id AS orderId, customerId, categories, amount FROM orders WHERE amount > 0 and 'test'=ANY(categories)), customerNames AS (SELECT id, firstName, lastName FROM customers) SELECT customerNames.firstName, customerNames.lastName, customerOrders.amount, customerOrders.categories, customerOrders.orderId FROM customerOrders JOIN customerNames ON customerOrders.customerId = customerNames.id",
      )
    }
  })
})
