import { TEST_DATABASE } from "../testUtils.js"
import { SQLBuiltinTypes } from "../types.js"
import { QueryContextBuilder } from "./context.js"
import { buildTableReference } from "./utils.js"

describe("Query context should be buildable and reflect the correct types", () => {
  it("Should work with the test database", () => {
    // Add something random
    const context = QueryContextBuilder.create(TEST_DATABASE)
      .add("test", (builder) => builder.addColumn("id", SQLBuiltinTypes.BIGINT))
      .copy(buildTableReference("orders"))
      .returning(TEST_DATABASE["tables"]["orders"]["columns"]).context

    // Ensure the active has the new data
    const active = context["active"]
    expect(active).not.toBeUndefined()
    expect(active["test"]).not.toBeUndefined()
    expect(active["orders"]).not.toBeUndefined()

    const returning = context["returning"]
    expect(returning).not.toBeUndefined()
    expect(returning["amount"]).not.toBeUndefined()
  })
})
