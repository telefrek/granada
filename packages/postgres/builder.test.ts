import { contains } from "@telefrek/data/relational/builder"
import {
  createRelationalQueryContext,
  isPostgresRelationalQuery,
  PostgresQueryBuilder,
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
}

const foo: CategoryEnum = "purchase"

describe("Postgres query syntax should be translated correctly", () => {
  it("Should create a valid query from  a builder", () => {
    const context = createRelationalQueryContext<TestDatabase>()
    const query = context
      .from("orders", "newOrders")
      .select("id", "categories")
      .alias("id", "order_id")
      .where(contains("categories", "purchase"))
      .build(PostgresQueryBuilder)

    if (isPostgresRelationalQuery(query)) {
      expect(query.queryText).toEqual(
        "SELECT id AS order_id, categories FROM orders AS newOrders WHERE 'purchase'=ANY(categories)"
      )
    }
  })
})
