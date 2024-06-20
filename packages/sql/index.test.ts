/**
 * Set of tests that are used for verifying schema results
 */

import { log } from "console"

import { inspect } from "util"
import { TEST_DATABASE as db } from "./testUtils.js"

describe("SQL mechanics should be supported", () => {
  it("Should allow simple schema and query to function", () => {
    log(inspect(db, true, 10, true))
  })
})
