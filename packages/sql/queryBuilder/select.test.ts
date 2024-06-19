import { log } from "console"
import { inspect } from "util"
import { TEST_DATABASE } from "../testUtils.js"
import { createSelect } from "./select.js"

describe("Select clauses should be buildable from a schema", () => {
  it("Should allow simple column selection", () => {
    const b = createSelect<
      typeof TEST_DATABASE,
      { users: (typeof TEST_DATABASE)["tables"]["users"] },
      "users"
    >("users")

    log(inspect(b.columns("id"), true, 10, true))
  })
})
