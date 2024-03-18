import {
  containsItems,
  cte,
  gt,
  joinEq,
} from "@telefrek/data/relational/builder"
import {
  PostgresQueryBuilder,
  createRelationalQueryContext,
  isPostgresRelationalQuery,
} from "./builder"
import { PostgresArray, PostgresColumnTypeName, PostgresEnum } from "./index"

type NumericIdentiry = {
  id: PostgresColumnTypeName.INTEGER
}

type TimeTrackedObject = {
  createdAt: PostgresColumnTypeName.INTEGER
  updatedAt: PostgresColumnTypeName.INTEGER
  removedAt?: PostgresColumnTypeName.INTEGER
}

const Category = {
  TEST: "test",
  PURCHASE: "purchase",
} as const

type Order = NumericIdentiry &
  TimeTrackedObject & {
    name: PostgresColumnTypeName.TEXT
    categories: PostgresArray<PostgresEnum<typeof Category>>
    amount: PostgresColumnTypeName.REAL
    customerId: PostgresColumnTypeName.INT
  }

type Customer = NumericIdentiry &
  TimeTrackedObject & {
    firstName: PostgresColumnTypeName.TEXT
    lastName: PostgresColumnTypeName.TEXT
  }

type OrderTable = {
  schema: Order
}

type CustomerTable = {
  schema: Customer
}

type TestDatabase = {
  tables: {
    orders: OrderTable
    customers: CustomerTable
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
      .build(PostgresQueryBuilder)

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "SELECT id AS orderId, categories FROM orders WHERE 'purchase'=ANY(categories)",
      )
    }
  })

  it("Should create a valid query from a builder with a cte and join", () => {
    const context = createRelationalQueryContext<TestDatabase>()
    const query = cte(context, "customerOrders", (builder) =>
      builder
        .from("orders")
        .select("id", "categories", "amount")
        .alias("id", "orderId")
        .where(gt("amount", 0))
        .join(
          context
            .from("customers")
            .select("firstName", "lastName", "createdAt"),
          joinEq("customerId", "id"),
        ),
    )
      .from("customerOrders")
      .select("*")
      .build(PostgresQueryBuilder)

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "WITH customerOrders AS (SELECT customers.createdAt, customers.firstName, customers.lastName, orders.amount, orders.categories, orders.id AS orderId FROM orders JOIN customers ON orders.customerId = customers.id WHERE orders.amount > 0) SELECT * FROM customerOrders",
      )
    }
  })

  it("Should create a valid query for multiple cte and a join in the main query", () => {
    const context = cte(
      cte(
        createRelationalQueryContext<TestDatabase>(),
        "customerOrders",
        (builder) =>
          builder
            .from("orders")
            .select("id", "customerId", "categories", "amount")
            .alias("id", "orderId")
            .where(gt("amount", 0)),
      ),
      "customerNames",
      (builder) =>
        builder.from("customers").select("id", "firstName", "lastName"),
    )

    const query = context
      .from("customerOrders")
      .select("orderId", "amount", "categories")
      .join(
        context.from("customerNames").select("firstName", "lastName"),
        joinEq("customerId", "id"),
      )
      .build(PostgresQueryBuilder)

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "WITH customerOrders AS (SELECT id AS orderId, customerId, categories, amount FROM orders WHERE amount > 0), customerNames AS (SELECT id, firstName, lastName FROM customers) SELECT customerNames.firstName, customerNames.lastName, customerOrders.amount, customerOrders.categories, customerOrders.orderId FROM customerOrders JOIN customerNames ON customerOrders.customerId = customerNames.id",
      )
    }
  })
})
