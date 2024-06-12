/**
 * Set of tests that are used for verifying schema results
 */

import { createSelectBuilder } from "./builder.js"
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

    const builder = createSelectBuilder(b, "bat").columns("firstName", "id")
    expect(builder).not.toBeUndefined()
  })
})
