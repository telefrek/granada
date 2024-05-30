import { query } from "./parser.js"

describe("The parser should handle a wide array of sql statements", () => {
  it("Should parse a basic statement", () => {
    const q = query("insert into orders(id, order_date) VALUES(1, now())")
    expect(q).not.toBeUndefined()
    // type T = TokenizeQuery<typeof q>
  })
})
