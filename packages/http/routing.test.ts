import type { Optional } from "@telefrek/core/type/utils.js"
import { HttpHandler, HttpMethod } from "./index.js"
import { LookupRequest, createRouter, type RouteInfo } from "./routing.js"

function request(
  path: string,
  method: HttpMethod = HttpMethod.GET,
): LookupRequest {
  return {
    path,
    method,
  }
}

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

  function verifyInfo(info: Optional<RouteInfo>): void {
    expect(info).not.toBeUndefined()
    if (info) {
      expect(info.handler).not.toBeUndefined()
      expect(info.template).not.toBeUndefined()
    }
  }

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

    verifyInfo(router.lookup(request("/valid")))

    verifyInfo(router.lookup(request("/")))
    const info = router.lookup(request("/path/ends/with/v123"))
    verifyInfo(info)
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

  test("A router in the middle should be consulted for matches before exploring more", () => {
    const router1 = createRouter()
    const router2 = createRouter()
    const handler: HttpHandler = (_) => Promise.reject("invalid")

    router2.addHandler("/some/path", handler, HttpMethod.GET)
    router1.addRouter("/", router2)
    router1.addHandler("/some/other/path", handler, HttpMethod.GET)
    router1.addHandler("/some/path", handler, HttpMethod.DELETE)

    expect(
      router1.lookup(request("/some/path", HttpMethod.DELETE)),
    ).not.toBeUndefined()
    expect(
      router1.lookup(request("/some/path", HttpMethod.GET)),
    ).not.toBeUndefined()
    expect(
      router1.lookup(request("/some/other/path", HttpMethod.GET)),
    ).not.toBeUndefined()
    expect(
      router1.lookup(request("/some/path", HttpMethod.PUT)),
    ).toBeUndefined()
  })

  test("A router should work regardless of order of insertion or location in the tree", () => {
    let router = createRouter()
    const handler: HttpHandler = (_) => Promise.reject("invalid")

    router.addHandler("/root/path1", handler, HttpMethod.POST)
    router.addHandler("/root/path1/:item", handler, HttpMethod.GET)
    router.addHandler("/root/path2", handler, HttpMethod.GET)

    expect(
      router.lookup(request("/root/path1", HttpMethod.POST)),
    ).not.toBeUndefined()
    expect(
      router.lookup(request("/root/path1", HttpMethod.GET)),
    ).toBeUndefined()
    expect(router.lookup(request("/root/path1/123"))).not.toBeUndefined()
    expect(router.lookup(request("/root/path2"))).not.toBeUndefined()

    router = createRouter()

    router.addHandler("/root/path2", handler, HttpMethod.GET)
    router.addHandler("/root/path1/:item", handler, HttpMethod.GET)
    router.addHandler("/root/path1", handler, HttpMethod.POST)

    expect(
      router.lookup(request("/root/path1", HttpMethod.POST)),
    ).not.toBeUndefined()
    expect(
      router.lookup(request("/root/path1", HttpMethod.GET)),
    ).toBeUndefined()
    expect(router.lookup(request("/root/path1/123"))).not.toBeUndefined()
    expect(router.lookup(request("/root/path2"))).not.toBeUndefined()

    router = createRouter()

    router.addHandler("/root/path1/:item", handler, HttpMethod.GET)
    router.addHandler("/root/path2", handler, HttpMethod.GET)
    router.addHandler("/root/path1", handler, HttpMethod.POST)

    expect(
      router.lookup(request("/root/path1", HttpMethod.POST)),
    ).not.toBeUndefined()
    expect(
      router.lookup(request("/root/path1", HttpMethod.GET)),
    ).toBeUndefined()
    expect(router.lookup(request("/root/path1/123"))).not.toBeUndefined()
    expect(router.lookup(request("/root/path2"))).not.toBeUndefined()
  })
})
