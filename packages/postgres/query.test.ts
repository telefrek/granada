import { isRowValid } from "./query"
import { PostgresColumnTypes, PostgresTable } from "./schema"

describe("Postgres schemas should be easily defined in code", () => {
  it("Should allow validating of postgres schemas for simple query", () => {
    interface MySchema extends PostgresTable {
      firstName: { type: PostgresColumnTypes.TEXT }
      lastName: { type: PostgresColumnTypes.TEXT }
      counter: { type: PostgresColumnTypes.INTEGER }
      validated: { type: PostgresColumnTypes.BOOLEAN }
      payload: { type: PostgresColumnTypes.JSONB }
    }

    expect(
      isRowValid<MySchema>({
        firstName: "foo",
        lastName: "bar",
        counter: 0,
        validated: false,
        payload: {}, // Figure out undefined, this is a problem
      }),
    ).toBeTruthy()
  })
})
