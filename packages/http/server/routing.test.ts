import {
  ConsoleLogWriter,
  DefaultLogger,
  LogLevel,
  setGlobalLogger,
} from "@telefrek/core/logging.js"
import { HttpHandler, HttpMethod } from "../index.js"
import { LookupRequest, createRouter } from "./routing.js"

function request(
  path: string,
  method: HttpMethod = HttpMethod.GET,
): LookupRequest {
  return {
    path,
    method,
  }
}

setGlobalLogger(
  new DefaultLogger({ writer: new ConsoleLogWriter(), level: LogLevel.INFO }),
)

describe("verify router", () => {
  test("A router should not accept invalid templates", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    expect(() => router.addHandler("/...", handler)).toThrow()
    expect(() => router.addHandler("/para:meter", handler)).toThrow()
    expect(() => router.addHandler("/parameter:", handler)).toThrow()
    expect(() => router.addHandler("/ /is/not/valid", handler)).toThrow()
    expect(() => router.addHandler("/cannot/**/terminate", handler)).toThrow()
    expect(() => router.addHandler("/*t", handler)).toThrow()
    expect(() => router.addHandler("/t*", handler)).toThrow()
    expect(() => router.addHandler("/***", handler)).toThrow()

    router.addHandler("/one/:two/three", handler)
    expect(() => router.addHandler("/one/*/three", handler)).toThrow()
  })

  test("A router should accept valid templates", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    router.addHandler("/", handler)
    router.addHandler("/valid", handler)
    router.addHandler("/this/is/a/valid/handler/", handler)
    router.addHandler("/:parameter/should/work", handler)
    router.addHandler("/terminal/**", handler)
    router.addHandler("/wildcards/*/should/be/:accepted/**", handler)
    router.addHandler("/path/ends/with/:variable", handler)

    expect(router.lookup(request("/valid"))).not.toBeUndefined()
    expect(router.lookup(request("/"))).not.toBeUndefined()
    const info = router.lookup(request("/path/ends/with/v123"))
    expect(info).not.toBeUndefined()
    expect(info?.parameters?.size).toBe(1)
    expect(info?.parameters?.get("variable")).toBe("v123")
  })

  test("A router should accept a top level terminal", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    router.addHandler("/**", handler)

    expect(router.lookup(request("/foo"))).not.toBeUndefined()
    expect(router.lookup(request("/foo/bar"))).not.toBeUndefined()
    expect(router.lookup(request("/foo/bar/baz"))).not.toBeUndefined()
  })

  test("A router should accept a top level wildcard", () => {
    const router = createRouter()
    const handler: HttpHandler = (_request) => Promise.reject("invalid")

    router.addHandler("/*", handler)

    expect(router.lookup(request("/bar/baz"))).toBeUndefined()
    expect(router.lookup(request("/bar"))).not.toBeUndefined()
  })
})
