/**
 * Testing for where clauses
 */

import { SQLColumn } from "../schema.js"
import { SQLBuiltinTypes } from "../types.js"
import { QueryContextBuilder } from "./context.js"
import { whereClause } from "./where.js"

describe("Where clauses should support simple functionality", () => {
  const testContext = QueryContextBuilder.create()
    .add("t1")
    .add("n", SQLColumn(SQLBuiltinTypes.INT))
    .add("s", SQLColumn(SQLBuiltinTypes.TEXT))
    .add("b", SQLColumn(SQLBuiltinTypes.BIT))
    .queryContext.add("t2")
    .add("n", SQLColumn(SQLBuiltinTypes.INT))
    .queryContext.add("t3")
    .add("s", SQLColumn(SQLBuiltinTypes.VARCHAR, { size: 10 }))
    .queryContext.build()

  it("Should support a simple filter", () => {
    const b = whereClause(testContext)
    expect(b).not.toBeUndefined()
    b.eq("n", "t2", 1)
    b.eq("b", "t1", ":param")
  })
})
