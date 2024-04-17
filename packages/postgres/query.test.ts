import {
  PostgresArray,
  PostgresColumnTypes,
  PostgresTable,
  Schema,
} from "./schema.js"

describe("Postgres schemas should be easily defined in code", () => {
  it("Should allow validating of postgres schemas for simple query", () => {
    interface MyTable extends PostgresTable {
      columns: {
        firstName: { type: PostgresColumnTypes.TEXT }
        lastName: { type: PostgresColumnTypes.TEXT }
        counter: { type: PostgresColumnTypes.INTEGER }
        validated?: { type: PostgresColumnTypes.BOOLEAN }
        payload?: { type: PostgresColumnTypes.JSONB }
        history?: { type: PostgresArray<PostgresColumnTypes.INTEGER> }
      }
    }

    const MySchema: Schema = {
      tables: {
        my_table: <MyTable>{},
      },
    }

    MySchema.tables.my_table

    expect(true).toBeTruthy()
  })
})
