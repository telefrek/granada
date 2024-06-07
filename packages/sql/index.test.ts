/**
 * Set of tests that are used for verifying schema results
 */

import { createBuilder } from "./query.js"
import { createSchemaBuilder } from "./schema.js"
import { SQLBuiltinTypes } from "./types.js"

describe("SQL mechanics should be supported", () => {
  it("Should allow simple schema and query to function", () => {
    // Create a base table in the schema
    const b = createSchemaBuilder()
      .createTable("bar")
      .addColumn("id", SQLBuiltinTypes.INT)
      .addColumn("name", SQLBuiltinTypes.TEXT)
      .addTable("id")
      .build()

    expect(b).not.toBeUndefined()

    // Create a query
    const query = createBuilder<
      typeof b
    >()(`with foo AS (SELECT id, name aS bname FROM bar WHERE id < 4),
    fo AS (SELECT * FROM foo)
    SELECT * FROM baz`)

    // Verify the queyr was created
    expect(query).not.toBeUndefined()
  })
})
