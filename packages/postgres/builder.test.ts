import { containsItems, cte } from "@telefrek/data/relational/builder"
import {
  PostgresQueryBuilder,
  createRelationalQueryContext,
  isPostgresRelationalQuery,
  type PostgresTableRow,
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

type CategoryEnum = PostgresEnum<typeof Category>

type Order = NumericIdentiry &
  TimeTrackedObject & {
    name: PostgresColumnTypeName.TEXT
    categories: PostgresArray<PostgresEnum<typeof Category>>
    customerId: PostgresColumnTypeName.INT
  }

type OrderTable = {
  schema: Order
}

type TestDatabase = {
  tables: {
    orders: OrderTable
  }
}

const order: PostgresTableRow<OrderTable> = {
  id: 1,
  name: "name",
  createdAt: 1,
  categories: ["purchase"],
  updatedAt: 1,
  customerId: 1,
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
        "SELECT id AS orderId, categories FROM orders WHERE 'purchase'=ANY(categories)"
      )
    }
  })

  it("Should create a valid query from a builder with a cte", () => {
    const context = createRelationalQueryContext<TestDatabase>()
    const query = cte(context, "customerOrders", (builder) =>
      builder
        .from("orders")
        .select("customerId", "id", "categories")
        .alias("id", "orderId")
        .where(containsItems("categories", "purchase"))
    )
      .from("customerOrders")
      .select("*")
      .build(PostgresQueryBuilder)

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "WITH customerOrders AS (SELECT customerId, id AS orderId, categories FROM orders WHERE 'purchase'=ANY(categories)) SELECT * FROM customerOrders"
      )
    }
  })
})
