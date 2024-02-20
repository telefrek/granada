import { InMemoryQueryExecutor, from } from "./inMemory"

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

describe("Relational query builder should support basic functionality", () => {
  it("should support a simple select * style query", async () => {
    const executor = new InMemoryQueryExecutor<TestDataStore>()
    const query = from<TestDataStore, "test">("test", {
      columns: ["id", "name"],
    }).build()

    expect(executor).not.toBeUndefined()
    expect(query).not.toBeUndefined()

    let result = await executor.run(query)
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(0)
    }

    const executor2 = new InMemoryQueryExecutor<TestDataStore>({
      sources: {
        test: [
          {
            id: 1,
            name: "record1",
            createdAt: Date.now(),
          },
        ],
      },
    })

    result = await executor2.run(query)
    expect(result).not.toBeUndefined()
    if (Array.isArray(result.rows)) {
      expect(result.rows.length).toBe(1)
      console.log(JSON.stringify(result.rows, undefined, 2))
    }
  })
})
