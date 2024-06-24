import { query } from "../builder.js"
import type { ParseSQLQuery } from "../parser.js"
import { TEST_DATABASE } from "../testUtils.js"

describe("Select clauses should be buildable from a schema", () => {
  it("Should allow simple column selection and filtering", () => {
    const b: ParseSQLQuery<"SELECT address, id as user_id FROM users as u WHERE id > :id"> =
      query(TEST_DATABASE)
        .select.from("users AS u")
        .columns("address", "id AS user_id")
        .where((b) => b.filter("id", ">", ":id")).ast

    // Verify both the type AND the value for aliasing is correct...
    expect(b.query.columns.user_id.reference.column).toBe("id")
    expect(b.query.from.alias).toBe("u")
  })

  it("Should allow a join between two tables", () => {
    const b: ParseSQLQuery<`SELECT address, email FROM users AS u INNER JOIN orders AS o ON user_id=u.id`> =
      query(TEST_DATABASE)
        .select.from("users AS u")
        .join("INNER", "orders AS o", (b) => b.filter("user_id", "=", "u.id"))
        .columns("email", "address").ast

    expect(b).not.toBeUndefined()
    expect(b.query.type).toBe("SelectClause")
    expect(b.query.join.on.right.type).toBe("ColumnReference")
  })
})
