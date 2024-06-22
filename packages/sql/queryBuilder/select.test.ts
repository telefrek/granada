import { log } from "console"
import { inspect } from "util"
import { query } from "../builder.js"
import type { ParseSQLQuery } from "../parser.js"
import { TEST_DATABASE } from "../testUtils.js"

describe("Select clauses should be buildable from a schema", () => {
  it("Should allow simple column selection and filtering", () => {
    const b: ParseSQLQuery<"SELECT address, id as user_id FROM users WHERE id > :id"> =
      query(TEST_DATABASE)
        .select.from("users")
        .columns("address", "id AS user_id")
        .where((b) => b.filter("id", ">", ":id")).ast

    log(inspect(b, true, 10, true))

    // Verify both the type AND the value for aliasing is correct...
    expect(b["query"]["columns"]["user_id"]["reference"]["column"]).toBe("id")
  })
})
