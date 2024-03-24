import {
  PostgresQueryBuilder,
  createRelationalQueryContext,
  isPostgresRelationalQuery,
} from "./builder"

import type { TestDatabase } from "./testUtils"

describe("Postgres query syntax should be translated correctly", () => {
  it("Should create a valid query from a builder", () => {
    const context = createRelationalQueryContext<TestDatabase>()
    const query = context
      .select("orders")
      .columns("id", "categories")
      .withColumnAlias("id", "orderId")
      .where((clause) => clause.containsItems("categories", ["purchase"]))
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
          .select("orders")
          .columns("id", "categories", "amount")
          .withColumnAlias("id", "orderId")
          .where((clause) => clause.gt("amount", 0))
          .join(
            "customers",
            (customers) =>
              customers.columns("firstName", "lastName", "createdAt"),
            "customerId",
            "id",
          ),
      )
      .select("customerOrders")
      .columns("*")
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
          .select("orders")
          .columns("id", "customerId", "categories", "amount")
          .withColumnAlias("id", "orderId")
          .where((clause) =>
            clause.and(
              clause.gt("amount", 0),
              clause.containsItems("categories", ["test"]),
            ),
          ),
      )
      .withCte("customerNames", (builder) =>
        builder.select("customers").columns("id", "firstName", "lastName"),
      )
      .select("customerOrders")
      .columns("orderId", "amount", "categories")
      .join(
        "customerNames",
        (customerNames) => customerNames.columns("firstName", "lastName"),
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
