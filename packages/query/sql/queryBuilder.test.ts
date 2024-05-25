import { info } from "console"
import {
  ExecutionMode,
  QueryType,
  type BoundQuery,
  type QueryExecutor,
  type QueryParameters,
  type RowType,
  type SimpleQuery,
} from "../index.js"
import {
  InMemoryQueryBuilder,
  InMemoryQueryExecutor,
  type InMemoryRelationalDataStore,
} from "./memory/builder.js"
import { query, useDataStore } from "./queryBuilder.js"
import { Category, type TestDatabaseType } from "./testUtils.js"

describe("hack", () => {
  it("Should hack", () => {
    const f = () => {
      const res = query`SELECT * FROM table`
      info(`Got res: ${res}`)
    }

    f()
  })
})

describe("Relational query builder should support basic select functionality", () => {
  const STORE: InMemoryRelationalDataStore<TestDatabaseType> = {
    orders: [],
    customers: [],
  }

  const EX = new InMemoryQueryExecutor<TestDatabaseType>(STORE)

  async function runQuery<T extends RowType>(
    query: SimpleQuery<T> | BoundQuery<T, QueryParameters>,
    executor: QueryExecutor = EX,
  ): Promise<T[]> {
    const result = await executor?.run(query)

    if (result.mode === ExecutionMode.Normal) {
      return result.rows
    }

    const rows: T[] = []
    for await (const r of result.stream) {
      rows.push(r)
    }

    return rows
  }

  // Ensure that we reset the local store to the same state for all tests
  beforeEach(() => {
    STORE.orders = [
      {
        id: 1,
        name: "record1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        categories: [Category.TEST, Category.PURCHASE],
        customerId: 1,
        amount: 1.0,
      },
      {
        id: 2,
        name: "record2",
        createdAt: 0,
        updatedAt: Date.now(),
        categories: [],
        customerId: 1,
        amount: 2.0,
      },
      {
        id: 3,
        name: "record3",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        categories: [Category.PURCHASE],
        customerId: 2,
        amount: 3.0,
      },
    ]

    STORE.customers = [
      {
        id: 1,
        firstName: "user",
        lastName: "one",
        createdAt: Date.now(),
      },
      {
        id: 2,
        firstName: "user",
        lastName: "two",
        createdAt: Date.now(),
      },
    ]
  })

  it("should support a simple select * style query", async () => {
    // This should get the full row back
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("*")
        .build("testQuery"),
    )
    expect(result).not.toBeUndefined()
    expect(result.length).toBe(STORE.orders.length)
  })

  it("should allow filtering rows via a simple where clause", async () => {
    let result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("*")
        .where((clause) => clause.gt("id", 2))
        .build("testQuery"),
    )

    expect(result.length).toBe(1)

    result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("*")
        .where((clause) => clause.gte("id", 2))
        .build("testQuery"),
    )

    expect(result.length).toBe(2)
  })

  it("should allow filtering via containment where clauses", async () => {
    // This should get the projected row with only 2 columns back
    let result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("*")
        .where((clause) => clause.contains("name", "ord3"))
        .build("testQuery"),
    )

    expect(result.length).toBe(1)

    result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .where((clause) => clause.containsItems("categories", Category.TEST))
        .columns("*")
        .build("testQuery"),
    )

    expect(result.length).toBe(1)

    result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("*")
        .where((clause) =>
          clause.containsItems("categories", Category.PURCHASE),
        )
        .build("testQuery"),
    )

    expect(result.length).toBe(2)
  })

  it("should allow for projections of rows via a simple select clause", async () => {
    // This should get the projected row with only 2 columns back
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("name", "createdAt")
        .build("testQuery"),
    )

    expect(result.length).toBe(STORE.orders.length)
  })

  it("should allow for projections of rows via a simple select clause in addition to row filtering via where clause", async () => {
    // Query order shouldn't matter
    const query1 = useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
      .select("orders")
      .columns("name", "createdAt")
      .where((clause) => clause.contains("name", "ord3"))
      .build("testQuery")

    const query2 = useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
      .select("orders")
      .where((clause) => clause.contains("name", "ord3"))
      .columns("name", "createdAt")
      .build("testQuery")

    // This should get the projected row with only 2 columns back
    for (const query of [query1, query2]) {
      const result = await runQuery(query)
      expect(result).not.toBeUndefined()
      expect(result.length).toBe(1)
    }
  })

  it("should allow complex grouped where clauses", async () => {
    // This should get the projected row with only 1 columns back
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("name")
        .where((clause) =>
          clause.and(
            clause.containsItems("categories", Category.PURCHASE),
            clause.not(clause.eq("id", 1)),
          ),
        )
        .build("testQuery"),
    )

    expect(result.length).toBe(1)
    expect(result[0].name).toBe("record3")
  })

  it("should allow columns to be aliased", async () => {
    // This should get the projected row with only 2 columns back
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("name", "createdAt")
        .withColumnAlias("name", "foo")
        .withColumnAlias("createdAt", "date")
        .build("testQuery"),
    )

    expect(result.length).toBe(STORE.orders.length)

    // Ensure aliasing works in intellisense and value is not mangled
    expect(result[0].foo).toBe(STORE.orders[0].name)
    expect(result[0].date).toBe(STORE.orders[0].createdAt)
  })

  it("should allow tables to be aliased", async () => {
    // Note this more more useful for joins but need to verify this weird
    // signature still works...
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .withTableAlias("orders", "newOrders")
        .select("newOrders")
        .columns("*")
        .build("testQuery"),
    )

    // This should get the projected row with only 2 columns back
    expect(result.length).toBe(STORE.orders.length)
  })

  it("should allow cte clauses", async () => {
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .withCte("foo", (builder) =>
          builder
            .select("orders")
            .columns("name", "categories")
            .where((clause) => clause.gt("id", 1)),
        )
        .select("foo")
        .columns("name")
        .where((clause) =>
          clause.containsItems("categories", Category.PURCHASE),
        )
        .build("testQuery"),
    )

    expect(result.length).toBe(1)
    expect(result[0].name).toBe(STORE.orders[2].name)
  })

  it("should allow multiple cte clauses", async () => {
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .withCte("foo", (builder) =>
          builder
            .select("orders")
            .columns("name", "categories")
            .where((clause) => clause.gt("id", 1)),
        )
        .withCte("bar", (builder) =>
          builder
            .select("foo")
            .columns("name")
            .where((clause) =>
              clause.containsItems("categories", Category.PURCHASE),
            ),
        )
        .select("bar")
        .columns("*")
        .build("testQuery"),
    )

    expect(result.length).toBe(1)
    expect(result[0].name).toBe(STORE.orders[2].name)
  })

  it("should allow basic inner joins", async () => {
    const store = useDataStore<TestDatabaseType>(InMemoryQueryBuilder)

    const result = await runQuery(
      store
        .select("orders")
        .columns("id")
        .withColumnAlias("id", "order_id")
        .join(
          "customers",
          (customers) =>
            customers
              .where((clause) => clause.eq("id", 2))
              .columns("firstName", "lastName"),
          "customerId",
          "id",
        )
        .build("testQuery"),
    )

    expect(result.length).toBe(1)
    expect(result[0].order_id).toBe(3) // order 3
    expect(result[0].firstName).toBe("user") // user 2
    expect(result[0].lastName).toBe("two")
  })

  it("should allow a join with a source that has no values", async () => {
    const store = useDataStore<TestDatabaseType>(InMemoryQueryBuilder)

    const result = await runQuery(
      store
        .select("orders")
        .columns("id")
        .join(
          "customers",
          (customers) => customers.where((clause) => clause.gt("id", 1)),
          "customerId",
          "id",
        )
        .build("testQuery"),
    )

    // Should only get orders from customer id 2
    expect(result.length).toBe(1)
    expect(result[0].id).toBe(3)
  })

  it("should allow multiple joins", async () => {
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .withTableAlias("orders", "orders2")
        .select("orders")
        .columns("id")
        .join(
          "orders2",
          (orders2) =>
            orders2.columns("customerId").where((clause) => clause.eq("id", 2)),
          "id",
          "id",
        )
        .join(
          "orders",
          "customers",
          (customers) => customers.columns("firstName", "lastName"),
          "customerId",
          "id",
        )
        .build("testQuery"),
    )

    expect(result.length).toBe(1)
    expect(result[0].firstName).toBe("user")
    expect(result[0].lastName).toBe("one")
    expect(result[0].customerId).toBe(1)
    expect(result[0].id).toBe(2)
  })

  it("should allow a join inside of a cte", async () => {
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .withCte("customerOrders", (builder) =>
          builder
            .select("orders")
            .columns("id")
            .withColumnAlias("id", "orderId")
            .join(
              "customers",
              (customers) => customers.columns("firstName", "lastName"),
              "customerId",
              "id",
            ),
        )
        .select("customerOrders")
        .columns("*")
        .where((clause) => clause.eq("lastName", "one"))
        .join(
          "customers",
          (customers) => customers.columns("createdAt"),
          "lastName",
          "lastName",
        )

        .build("testQuery"),
    )

    const customer = STORE.customers[0]
    expect(result.length).toBe(2)
    expect(result[0].orderId).toBe(1) // order 2
    expect(result[0].firstName).toBe(customer.firstName) // user 1
    expect(result[0].lastName).toBe(customer.lastName)
    expect(result[0].createdAt).toBe(customer.createdAt)
  })

  it("should allow a join utilizing a cte", async () => {
    const result = await runQuery(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .withCte("customerOrders", (builder) =>
          builder
            .select("orders")
            .columns("customerId", "id", "createdAt")
            .withColumnAlias("id", "orderId"),
        )
        .select("customerOrders")
        .columns("*")
        .join(
          "customers",
          (from) => from.columns("firstName", "lastName"),
          "customerId",
          "id",
        )
        .build("testQuery"),
    )

    expect(result.length).toBe(3)

    expect(result[0].orderId).toBe(1)
    expect(result[0].lastName).toBe("one")

    expect(result[2].orderId).toBe(3)
    expect(result[2].lastName).toBe("two")
  })
})

describe("Relational query builder should support basic select functionality", () => {
  const STORE: InMemoryRelationalDataStore<TestDatabaseType> = {
    orders: [],
    customers: [],
  }

  const executor = new InMemoryQueryExecutor<TestDatabaseType>(STORE)

  beforeEach(() => {
    STORE.orders = []
    STORE.customers = []
  })

  it("Should support a simple insert", async () => {
    const query = useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
      .insert("orders")
      .returning("id", "name", "categories")
      .build("insertOrder")

    expect(query).not.toBeUndefined()
    expect(query.queryType).toBe(QueryType.PARAMETERIZED)
    expect(query.bind).not.toBeUndefined()

    const bound = query.bind({
      id: 1,
      customerId: 1,
      name: "order1",
      categories: [Category.TEST],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      amount: 1.0,
    })

    expect(bound).not.toBeUndefined()
    expect(bound.queryType).toBe(QueryType.BOUND)
    expect(bound.parameters).not.toBeUndefined()
    expect(bound.parameters.id).toEqual(1)

    const results = await executor.run(bound)
    expect(results).not.toBeUndefined()

    const returned = results.mode === ExecutionMode.Normal ? results.rows : []
    expect(returned.length).toBe(1)
    expect(returned[0].categories.length).toBe(1)
    expect(returned[0].name).toBe("order1")

    expect(STORE.orders.length).toBe(1)
    expect(STORE.orders[0].id).toBe(1)

    const selectRes = await executor.run(
      useDataStore<TestDatabaseType>(InMemoryQueryBuilder)
        .select("orders")
        .columns("*")
        .build("select"),
    )

    const rows = selectRes.mode === ExecutionMode.Normal ? selectRes.rows : []
    expect(rows.length).toBe(1)
    expect(rows[0].id).toEqual(1)
  })
})
