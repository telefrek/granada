/**
 * Set of tests that are used for verifying schema results
 */

import { log } from "console"
import { createSelectBuilder } from "./builder.js"

import { inspect } from "util"
import { TEST_DATABASE as db } from "./testUtils.js"

describe("SQL mechanics should be supported", () => {
  it("Should allow simple schema and query to function", () => {
    log(inspect(db, true, 10, true))
    const builder = createSelectBuilder(db, "orders").columns("id", "amount")
    expect(builder).not.toBeUndefined()
  })
})
