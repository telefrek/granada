import { HttpHandler, HttpMethod, HttpRequest, parsePath } from ".."
import { TestRequest } from "../testUtils"
import { createRouter } from "./index"

function request(
  path: string,
  method: HttpMethod = HttpMethod.GET,
): HttpRequest {
  return new TestRequest({
    ...parsePath(path),
    method: method,
  })
}

describe("verify router", () => {
  test("A router should not accept invalid templates", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    expect(() => router.register("/", handler)).toThrow()
    expect(() => router.register("/...", handler)).toThrow()
    expect(() => router.register("/{parameter", handler)).toThrow()
    expect(() => router.register("/{{parameter}}", handler)).toThrow()
    expect(() => router.register("/invlid{parameter}", handler)).toThrow()
    expect(() => router.register("/ /is/not/valid", handler)).toThrow()
    expect(() => router.register("/cannot/**/terminate", handler)).toThrow()
    expect(() => router.register("/*t", handler)).toThrow()
    expect(() => router.register("/t*", handler)).toThrow()

    router.register("/one/{two}/three", handler)
    expect(() => router.register("/one/*/three", handler)).toThrow()
  })

  test("A router should accept valid templates", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    router.register("/valid", handler)
    router.register("/this/is/a/valid/handler/", handler)
    router.register("/{parameter}/should/work", handler)
    router.register("/{multiple}/parameters/{should}/work", handler)
    router.register("/terminal/**", handler)
    router.register("/wildcards/*/should/be/{accepted}/**", handler)

    expect(router.lookup(request("/valid"))).not.toBeUndefined()
  })

  test("A router should accept a top level terminal", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    router.register("/**", handler)

    expect(router.lookup(request("/foo"))).not.toBeUndefined()
    expect(router.lookup(request("/foo/bar"))).not.toBeUndefined()
    expect(router.lookup(request("/foo/bar/baz"))).not.toBeUndefined()
  })

  test("A router should accept a top level wildcard", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    router.register("/*", handler)

    expect(router.lookup(request("/bar/baz"))).toBeUndefined()
    expect(router.lookup(request("/bar"))).not.toBeUndefined()
  })
})
