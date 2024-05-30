/**
 * Set of tests that are used for verifying schema results
 */

import { SQLColumn, type ColumnTypeDefinition } from "./schema.js"
import { SQLBuiltinTypes } from "./types.js"

describe("SQL Schema types should work as expected", () => {
  it("Should allow for simple column definitions", () => {
    const c1: ColumnTypeDefinition<SQLBuiltinTypes.BIGINT> = {
      type: SQLBuiltinTypes.BIGINT,
      nullable: false,
      autoIncrement: true,
    }

    const c2 = SQLColumn(SQLBuiltinTypes.BIGINT, {
      autoIncrement: true,
    })

    // The two column definitions should be identical
    expect(c1).toStrictEqual(c2)

    const c3: ColumnTypeDefinition<SQLBuiltinTypes.CLOB> = {
      type: SQLBuiltinTypes.CLOB,
      nullable: true,
    }

    const c4 = SQLColumn(SQLBuiltinTypes.CLOB, { nullable: true })
    expect(c3).toStrictEqual(c4)
  })
})
