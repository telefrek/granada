import { QueryError, isQueryError } from "./error"

describe("query errors should function as expected", () => {
  it("should be detectable via type guards", () => {
    expect(isQueryError(new QueryError())).toBeTruthy()
    expect(new QueryError() instanceof QueryError).toBeTruthy()
  })

  it("should transfer to subclasses", () => {
    class ExtendedError extends QueryError {}

    expect(isQueryError(new ExtendedError())).toBeTruthy()
    expect(new ExtendedError() instanceof QueryError).toBeTruthy()
  })
})
