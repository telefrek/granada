/**
 * Testing for where clauses
 */

import type { ParseWhereClause } from "../parsing/where.js"
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
    // Verify that our string parsing type matches what the query returns
    const w: ParseWhereClause<`WHERE t2.n = 1`> = {
      where: whereClause(testContext).filter("t2.n", "=", 1),
    }
    expect(w).not.toBeUndefined()

    const w2: ParseWhereClause<`WHERE b = false`> = {
      where: whereClause(testContext).filter("b", "=", false),
    }

    expect(w2).not.toBeUndefined()
  })

  it("Should support a logical tree", () => {
    const b = whereClause(testContext)
    const w: ParseWhereClause<`WHERE t1.n > 1 AND t1.n < 3`> = {
      where: b.and(b.filter("t1.n", ">", 1), b.filter("t1.n", "<", 3)),
    }

    expect(w).not.toBeUndefined()
  })
})
