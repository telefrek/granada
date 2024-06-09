/**
 * Set of tests that are used for verifying schema results
 */

import { inspect } from "util"
import { createBuilder } from "./query.js"
import { createSchemaBuilder } from "./schema.js"
import { SQLBuiltinTypes } from "./types.js"

describe("SQL mechanics should be supported", () => {
  it("Should allow simple schema and query to function", () => {
    // Create a base table in the schema
    const b = createSchemaBuilder()
      .createTable("bat")
      .addColumn("id", SQLBuiltinTypes.INT)
      .addColumn("firstName", SQLBuiltinTypes.TEXT)
      .addTable("id")
      .build()

    // eslint-disable-next-line no-console
    console.log(inspect(b, true, 10, true))

    expect(b).not.toBeUndefined()

    // Create a query
    const query = createBuilder<
      typeof b
    >()(`with foo AS (SELECT id, firstName aS first_name FROM bat WHERE id < 4),
    baz AS (SELECT id, first_name FROM foo)
    SELECT first_name FROM baz`)

    // Verify the queyr was created
    expect(query).not.toBeUndefined()
    query.execute()
  })
})
