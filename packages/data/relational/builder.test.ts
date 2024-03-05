import { columns, from } from "./builder"
import {
  InMemoryQueryExecutor,
  InMemoryRelationalQueryBuilder,
  type InMemoryRelationalDataStore,
} from "./memory"

enum Category {
  TEST,
  PURCHASE,
}

interface OrderTable {
  id: number
  name: string
  createdAt: number
  categories: Category[]
  removedAt?: number
}

interface TestDataStore {
  tables: {
    orders: OrderTable
  }
}

const STORE: InMemoryRelationalDataStore<TestDataStore> = {
  orders: [],
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
        categories: [Category.TEST, Category.PURCHASE],
      },
      { id: 2, name: "record2", createdAt: Date.now() - 1000, categories: [] },
      {
        id: 3,
        name: "record3",
        createdAt: Date.now(),
        categories: [Category.PURCHASE],
      },
    ]
  })

  it("should support a simple select * style query", async () => {
    // Create the builders
    const query = from<TestDataStore>("orders").build(
      InMemoryRelationalQueryBuilder
    )

    // This should get the full row back
    const result = await executor.run(query)
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
      expect(Object.keys(result.rows[0]).length).toEqual(4)
    }
  })

  it("should allow filtering rows via a simple where clause", async () => {
    const query = from<TestDataStore>("orders")
      .where(columns.IN("name", "ord3"))
      .build(InMemoryRelationalQueryBuilder)

    // This should get the projected row with only 2 columns back
    const result = await executor.run(query)
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(Object.keys(result.rows[0]).length).toEqual(
        Object.keys(STORE.orders[0]).length
      )
    }
  })

  it("should allow for projections of rows via a simple select clause", async () => {
    const query = from<TestDataStore>("orders")
      .select(["name", "createdAt"])
      .build(InMemoryRelationalQueryBuilder)

    // This should get the projected row with only 2 columns back
    const result = await executor.run(query)
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(STORE.orders.length)
      expect(Object.keys(result.rows[0]).length).toEqual(2)
    }
  })

  it("should allow for projections of rows via a simple select clause in addition to row filtering via where clause", async () => {
    const query = from<TestDataStore>("orders")
      .select(["name", "createdAt"])
      .where(columns.IN("name", "ord3"))
      .build(InMemoryRelationalQueryBuilder)

    // This should get the projected row with only 2 columns back
    const result = await executor.run(query)
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      expect(Object.keys(result.rows[0]).length).toEqual(2)
    }
  })
})
