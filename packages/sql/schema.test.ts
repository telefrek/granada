/**
 * Set of tests that are used for verifying schema results
 */

import { createSchemaBuilder } from "./schema.js"
import { SQLBuiltinTypes } from "./types.js"
import type { ValidateQueryString } from "./validation.js"

describe("SQL Schema types should work as expected", () => {
  it("Should allow for simple column definitions", () => {
    const b = createSchemaBuilder()
      .createTable("bar")
      .addColumn("id", SQLBuiltinTypes.INT)
      .addColumn("name", SQLBuiltinTypes.TEXT)
      .addTable("id")
      .build()

    expect(b).not.toBeUndefined()

    type vt = ValidateQueryString<
      typeof b,
      `with foo AS (SELECT id, name aS bname FROM bar WHERE id < 4),
    baz AS (SELECT * FROM foo)
    SELECT * FROM baz`
    >

    const v: vt = {
      tables: {
        bar: {
          columns: {
            id: { type: SQLBuiltinTypes.INT },
            name: { type: SQLBuiltinTypes.TEXT },
          },
          key: { column: "id" },
        },
        foo: {
          columns: {},
        },
        baz: {
          columns: {},
        },
      },
      relations: [],
    }

    expect(v).not.toBeUndefined()
  })
})
