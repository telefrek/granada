import { log } from "console"
import { inspect } from "util"
import { TEST_DATABASE } from "../testUtils.js"
import { createSelect } from "./select.js"

describe("Select clauses should be buildable from a schema", () => {
  it("Should allow simple column selection", () => {
    const b = createSelect<(typeof TEST_DATABASE)["tables"], "users">("users")

    b.col("")
    log(inspect(b, true, 10, true))
  })
})
