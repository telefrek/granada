import { useDataStore } from "."
import {
  InMemoryQueryExecutor,
  InMemoryRelationalQueryBuilder,
  type InMemoryRelationalDataStore,
} from "../memory/builder"

enum Category {
  TEST,
  PURCHASE,
}

interface NumericIdentiry {
  id: number
}

interface TimeTrackedObject {
  createdAt: number
  updatedAt: number
  removedAt?: number
}

interface Order extends NumericIdentiry, TimeTrackedObject {
  name: string
  categories: Category[]
  customerId: number
}

interface Customer extends NumericIdentiry, TimeTrackedObject {
  firstName: string
  lastName: string
}

interface TestDataStore {
  tables: {
    orders: Order
    customers: Customer
  }
}

const STORE: InMemoryRelationalDataStore<TestDataStore> = {
  orders: [],
  customers: [],
}

const executor = new InMemoryQueryExecutor<TestDataStore>(STORE)

// Take a type T
// Get alias type A as { [subset of keyof T]: string }
// Get return type R as { [key: A[K]] : T[K]} where K is a key in T and I want
// the alias value of that as the name of the type R

describe("Relational query builder should support basic functionality", () => {
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
      },
      {
        id: 2,
        name: "record2",
        createdAt: 0,
        updatedAt: Date.now(),
        categories: [],
        customerId: 1,
      },
      {
        id: 3,
        name: "record3",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        categories: [Category.PURCHASE],
        customerId: 2,
      },
    ]

    STORE.customers = [
      {
        id: 1,
        firstName: "user",
        lastName: "one",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 2,
        firstName: "user",
        lastName: "two",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
  })

  it("should support a simple select * style query", async () => {
    // This should get the full row back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("*")
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
    }
  })

  it("should allow filtering rows via a simple where clause", async () => {
    let result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("*")
        .where((clause) => clause.gt("id", 2))
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("*")
        .where((clause) => clause.gte("id", 2))
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(2)
    }
  })

  it("should allow filtering via containment where clauses", async () => {
    // This should get the projected row with only 2 columns back
    let result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("*")
        .where((clause) => clause.contains("name", "ord3"))
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .where((clause) => clause.containsItems("categories", Category.TEST))
        .columns("*")
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("*")
        .where((clause) =>
          clause.containsItems("categories", Category.PURCHASE),
        )
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(2)
    }
  })

  it("should allow for projections of rows via a simple select clause", async () => {
    // This should get the projected row with only 2 columns back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("name", "createdAt")
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
    }
  })

  it("should allow for projections of rows via a simple select clause in addition to row filtering via where clause", async () => {
    // Query order shouldn't matter
    const query1 = useDataStore<TestDataStore>()
      .select("orders")
      .columns("name", "createdAt")
      .where((clause) => clause.contains("name", "ord3"))
      .build(InMemoryRelationalQueryBuilder, "testQuery")

    const query2 = useDataStore<TestDataStore>()
      .select("orders")
      .where((clause) => clause.contains("name", "ord3"))
      .columns("name", "createdAt")
      .build(InMemoryRelationalQueryBuilder, "testQuery")

    // This should get the projected row with only 2 columns back
    for (const query of [query1, query2]) {
      const result = await executor.run(query)
      expect(result).not.toBeUndefined()
      if (Array.isArray(result.rows)) {
        expect(result.rows.length).toBe(1)
      }
    }
  })

  it("should allow complex grouped where clauses", async () => {
    // This should get the projected row with only 1 columns back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("name")
        .where((clause) =>
          clause.and(
            clause.containsItems("categories", Category.PURCHASE),
            clause.not(clause.eq("id", 1)),
          ),
        )
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].name).toBe("record3")
    }
  })

  it("should allow columns to be aliased", async () => {
    // This should get the projected row with only 2 columns back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .select("orders")
        .columns("name", "createdAt")
        .withColumnAlias("name", "foo")
        .withColumnAlias("createdAt", "date")
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)

      // Ensure aliasing works in intellisense and value is not mangled
      expect(result.rows[0].foo).toBe(STORE.orders[0].name)
      expect(result.rows[0].date).toBe(STORE.orders[0].createdAt)
    }
  })

  it("should allow tables to be aliased", async () => {
    // Note this more more useful for joins but need to verify this weird
    // signature still works...
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .withTableAlias("orders", "newOrders")
        .select("newOrders")
        .columns("name", "createdAt")
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    // This should get the projected row with only 2 columns back
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
      expect(Object.keys(result.rows[0]).length).toEqual(2)
    }
  })

  it("should allow cte clauses", async () => {
    const result = await executor.run(
      useDataStore<TestDataStore>()
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
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].name).toBe(STORE.orders[2].name)
    }
  })

  it("should allow multiple cte clauses", async () => {
    const result = await executor.run(
      useDataStore<TestDataStore>()
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
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].name).toBe(STORE.orders[2].name)
    }
  })

  it("should allow basic inner joins", async () => {
    const store = useDataStore<TestDataStore>()

    const result = await executor.run(
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
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].order_id).toBe(3) // order 3
      expect(result.rows[0].firstName).toBe("user") // user 2
      expect(result.rows[0].lastName).toBe("two")
    }
  })

  it("should allow a join with a source that has no values", async () => {
    const store = useDataStore<TestDataStore>()

    const result = await executor.run(
      store
        .select("orders")
        .columns("id")
        .join(
          "customers",
          (customers) => customers.where((clause) => clause.gt("id", 1)),
          "customerId",
          "id",
        )
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    // Should only get orders from customer id 2
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].id).toBe(3)
    }
  })

  it("should allow multiple joins", async () => {
    const result = await executor.run(
      useDataStore<TestDataStore>()
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
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].firstName).toBe("user")
      expect(result.rows[0].lastName).toBe("one")
      expect(result.rows[0].customerId).toBe(1)
      expect(result.rows[0].id).toBe(2)
    }
  })

  it("should allow a join inside of a cte", async () => {
    const result = await executor.run(
      useDataStore<TestDataStore>()
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

        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    if (Array.isArray(result.rows)) {
      const customer = STORE.customers[0]
      expect(result.rows.length).toBe(2)
      expect(result.rows[0].orderId).toBe(1) // order 2
      expect(result.rows[0].firstName).toBe(customer.firstName) // user 1
      expect(result.rows[0].lastName).toBe(customer.lastName)
      expect(result.rows[0].createdAt).toBe(customer.createdAt)
    }
  })

  it("should allow a join utilizing a cte", async () => {
    const result = await executor.run(
      useDataStore<TestDataStore>()
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
        .build(InMemoryRelationalQueryBuilder, "testQuery"),
    )

    expect(Array.isArray(result.rows)).toBeTruthy()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(3)

      expect(result.rows[0].orderId).toBe(1)
      expect(result.rows[0].lastName).toBe("one")

      expect(result.rows[2].orderId).toBe(3)
      expect(result.rows[2].lastName).toBe("two")
    }
  })
})