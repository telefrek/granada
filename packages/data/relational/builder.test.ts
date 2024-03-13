import {
  and,
  contains,
  containsItems,
  cte,
  eq,
  gt,
  gte,
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
      },
      {
        id: 2,
        name: "record2",
        createdAt: 0,
        updatedAt: Date.now(),
        categories: [],
      },
      {
        id: 3,
        name: "record3",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        categories: [Category.PURCHASE],
      },
    ]
  })

  it("should support a simple select * style query", async () => {
    // This should get the full row back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
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
        .where(gt("id", 2))
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
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
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
    }

    result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders")
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
      expect(Object.keys(result.rows[0]).length).toEqual(2)
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
        expect(Object.keys(result.rows[0]).length).toEqual(2)
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
      expect(Object.keys(result.rows[0]).length).toEqual(2)

      // Ensure aliasing works in intellisense and value is not mangled
      expect(result.rows[0].foo).toBe(STORE.orders[0].name)
      expect(result.rows[0].date).toBe(STORE.orders[0].createdAt)
    }
  })

  it("should allow tables to be aliased", async () => {
    // This should get the projected row with only 2 columns back
    const result = await executor.run(
      useDataStore<TestDataStore>()
        .from("orders", "newOrders")
        .select("name", "createdAt")
        .build(InMemoryRelationalQueryBuilder)
    )

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
        .build(InMemoryRelationalQueryBuilder)
    )

    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].name).toBe(STORE.orders[2].name)
    }
  })

  it("should allow basic inner joins", () => {
    const store = useDataStore<TestDataStore>()

    // TODO: Add filtering type (equality)
    // store.join("orders", "customers", "id", "id", JoinType.INNER)
  })
})
