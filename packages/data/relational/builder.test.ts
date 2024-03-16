import {
  aliasTable,
  and,
  contains,
  containsItems,
  cte,
  eq,
  gt,
  gte,
  joinEq,
  not,
  useDataStore,
} from "./builder"
import {
  InMemoryQueryExecutor,
  InMemoryRelationalQueryBuilder,
  type InMemoryRelationalDataStore,
} from "./memory"

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
        .from("orders")
        .select("*")
        .build(InMemoryRelationalQueryBuilder)
    )
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
    }
  })

  it("should allow filtering rows via a simple where clause", async () => {
    let result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
        .select("*")
        .where(gt("id", 2))
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
        .select("*")
        .where(gte("id", 2))
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(2)
    }
  })

  it("should allow filtering via containment where clauses", async () => {
    // This should get the projected row with only 2 columns back
    let result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
        .select("*")
        .where(contains("name", "ord3"))
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
        .where(containsItems("categories", Category.TEST))
        .select("*")
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
        .select("*")
        .where(containsItems("categories", Category.PURCHASE))
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(2)
    }
  })

  it("should allow for projections of rows via a simple select clause", async () => {
    // This should get the projected row with only 2 columns back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
        .select("name", "createdAt")
        .build(InMemoryRelationalQueryBuilder)
    )
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
    }
  })

  it("should allow for projections of rows via a simple select clause in addition to row filtering via where clause", async () => {
    // Query order shouldn't matter
    const query1 = useDataStore<TestDataStore>()
      .from("orders")
      .select("name", "createdAt")
      .where(contains("name", "ord3"))
      .build(InMemoryRelationalQueryBuilder)

    const query2 = useDataStore<TestDataStore>()
      .from("orders")
      .where(contains("name", "ord3"))
      .select("name", "createdAt")
      .build(InMemoryRelationalQueryBuilder)

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
        .from("orders")
        .select("name")
        .where(
          and(containsItems("categories", Category.PURCHASE), not(eq("id", 1)))
        )
        .build(InMemoryRelationalQueryBuilder)
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
        .from("orders")
        .select("name", "createdAt")
        .alias("name", "foo")
        .alias("createdAt", "date")
        .build(InMemoryRelationalQueryBuilder)
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
      // from("newOrders", useDataStore<TestDataStore>(), (builder) =>
      //   builder.from("orders").select("name", "createdAt")
      // )
      aliasTable(
        "newOrders",
        useDataStore<TestDataStore>().from("orders").select("name", "createdAt")
      )
        .from("newOrders")
        .select("*")
        .build(InMemoryRelationalQueryBuilder)
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
      cte(useDataStore<TestDataStore>(), "foo", (builder) =>
        builder.from("orders").select("name", "categories").where(gt("id", 1))
      )
        .from("foo")
        .select("name")
        .where(containsItems("categories", Category.PURCHASE))
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].name).toBe(STORE.orders[2].name)
    }
  })

  it("should allow multiple cte clauses", async () => {
    const result = await executor.run(
      cte(
        cte(useDataStore<TestDataStore>(), "foo", (builder) =>
          builder.from("orders").select("name", "categories").where(gt("id", 1))
        ),
        "bar",
        (builder) =>
          builder
            .from("foo")
            .select("name")
            .where(containsItems("categories", Category.PURCHASE))
      )
        .from("bar")
        .select("*")
        .build(InMemoryRelationalQueryBuilder)
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
        .from("orders")
        .select("id")
        .alias("id", "order_id")
        .join(
          store
            .from("customers")
            .where(eq("id", 2))
            .select("firstName", "lastName"),
          joinEq("customerId", "id")
        )
        .build(InMemoryRelationalQueryBuilder)
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
        .from("orders")
        .select("id")
        .join(
          store.from("customers").where(gt("id", 1)),
          joinEq("customerId", "id")
        )
        .build(InMemoryRelationalQueryBuilder)
    )

    // Should only get orders from customer id 2
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].id).toBe(3)
    }
  })

  it("should allow multiple joins", async () => {
    const store = aliasTable(
      "order2",
      useDataStore<TestDataStore>().from("orders").select("*")
    )

    const result = await executor.run(
      store
        .from("orders")
        .select("id")
        .join(
          store.from("order2").select("customerId").where(eq("id", 2)),
          joinEq("id", "id")
        )
        .join(
          "orders",
          store.from("customers").select("firstName", "lastName"),
          joinEq("customerId", "id")
        )
        .build(InMemoryRelationalQueryBuilder)
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
    const store = useDataStore<TestDataStore>()

    const result = await executor.run(
      cte(store, "customerOrders", (builder) =>
        builder
          .from("orders")
          .select("id")
          .alias("id", "orderId")
          .join(
            builder.from("customers").select("firstName", "lastName"),
            joinEq("customerId", "id")
          )
      )
        .from("customerOrders")
        .select("*")
        .where(eq("lastName", "one"))
        .join(
          store.from("customers").select("createdAt"), // Add an additional column that wasn't part of cte...
          joinEq("lastName", "lastName")
        )

        .build(InMemoryRelationalQueryBuilder)
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
    const store = cte(
      useDataStore<TestDataStore>(),
      "customerOrders",
      (builder) =>
        builder
          .from("orders")
          .select("customerId", "id", "createdAt")
          .alias("id", "orderId")
    )

    const result = await executor.run(
      store
        .from("customerOrders")
        .select("*")
        .join(
          store.from("customers").select("firstName", "lastName"),
          joinEq("customerId", "id")
        )
        .build(InMemoryRelationalQueryBuilder)
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
