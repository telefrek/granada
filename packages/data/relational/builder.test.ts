import { columns, from } from "./builder"
import { InMemoryQueryExecutor, InMemoryRelationalQueryBuilder } from "./memory"

interface TestTable {
  id: number
  name: string
  createdAt: number
  removedAt?: number
}

interface TestDataStore {
  tables: {
    test: TestTable
  }
}

// Take a type T
// Get alias type A as { [subset of keyof T]: string }
// Get return type R as { [key: A[K]] : T[K]} where K is a key in T and I want
// the alias value of that as the name of the type R

describe("Relational query builder should support basic functionality", () => {
  it("should support a simple select * style query", async () => {
    // Create the builders
    const fromBuilder = from<TestDataStore>("test").builder(
      InMemoryRelationalQueryBuilder
    )

    const selectBuilder = from<TestDataStore>("test")
      .select(["name", "createdAt"])
      .where(columns.GTE("createdAt", Date.now()))
      .builder(InMemoryRelationalQueryBuilder)
    expect(selectBuilder).not.toBeUndefined()

    const executor = new InMemoryQueryExecutor<TestDataStore>({
      test: [
        { id: 1, name: "record1", createdAt: Date.now() },
        { id: 2, name: "record2", createdAt: Date.now() - 1000 },
      ],
    })

    // This should get the full row back
    const result = await executor.run(fromBuilder.build())
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(2)
      console.log(JSON.stringify(result.rows, undefined, 2))
      expect(Object.keys(result.rows[0]).length).toEqual(3)
    }

    // This should get the projected row with only 2 columns back
    const selectResult = await executor.run(selectBuilder.build())
    expect(selectResult).not.toBeUndefined()
    if (Array.isArray(selectResult.rows)) {
      expect(selectResult.rows.length).toBe(1)
      console.log(JSON.stringify(selectResult.rows, undefined, 2))
      expect(Object.keys(selectResult.rows[0]).length).toEqual(2)
    }
  })
})
