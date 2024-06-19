/**
 * Testing for where clauses
 */

import type { ParseWhereClause } from "../parsing/where.js"
import { TEST_DATABASE } from "../testUtils.js"
import { SQLBuiltinTypes } from "../types.js"
import { QueryContextBuilder } from "./context.js"
import { whereClause } from "./where.js"

describe("Where clauses should support simple functionality", () => {
  const testContext = QueryContextBuilder.create(TEST_DATABASE)
    .add("t1", (b) =>
      b
        .addColumn("n", SQLBuiltinTypes.INT)
        .addColumn("s", SQLBuiltinTypes.TEXT)
        .addColumn("b", SQLBuiltinTypes.BIT),
    )
    .add("t2", (b) => b.addColumn("n", SQLBuiltinTypes.INT))
    .add("t3", (b) =>
      b.addColumn("s", SQLBuiltinTypes.VARCHAR, { size: 10 }),
    ).context

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
