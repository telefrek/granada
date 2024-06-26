import { TestDatabase } from "./testUtils.js"
import { SQLColumnType } from "./types.js"

describe("The type system should allow translation between types", () => {
  it("should map correctly between TS and SQL schema objects", () => {
    const database = TestDatabase

    const orders = database.tables.orders
    const schema = orders.columns
    expect(schema.id.type).toEqual(SQLColumnType.BIGINT)
    expect(schema.name.type).toEqual(SQLColumnType.TEXT)
  })
})
