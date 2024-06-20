import { log } from "console"
import { inspect } from "util"
import type { ParseSQLQuery } from "../parser.js"
import { TEST_DATABASE } from "../testUtils.js"
import { QueryContextBuilder } from "./context.js"
import { createSelect } from "./select.js"

describe("Select clauses should be buildable from a schema", () => {
  it("Should allow simple column selection", () => {
    const context =
      QueryContextBuilder.create(TEST_DATABASE).copy("users").context

    const b: ParseSQLQuery<"SELECT address, id as user_id FROM users WHERE id > :id"> =
      {
        type: "SQLQuery",
        query: createSelect(context, "users")
          .columns("id AS user_id", "address")
          .where((b) => b.filter("id", ">", ":id")).ast,
      }

    log(inspect(b, true, 10, true))
  })
})
