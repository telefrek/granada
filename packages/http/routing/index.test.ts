import { HttpHandler, HttpMethod, HttpRequest, HttpResponse, emptyHeaders } from "../core";
import { createRouter } from "./index";

function request<T>(path: string, method: HttpMethod = HttpMethod.GET): HttpRequest<T>{
    return { path, 
        method: method, 
        headers: emptyHeaders(), 
        hasBody: false, 
        body: () => Promise.reject("no"), 
        readable: () => undefined,
        respond: <U>() => <HttpResponse<U>>{} 
    }
}

describe('verify router', () => {
    test('A router should not accept invalid templates', () => {
        const router = createRouter()
        const handler: HttpHandler<any, any> = (_request) => Promise.reject("invalid")

        expect(() => router.register("/", handler)).toThrowError()
        expect(() => router.register("/...", handler)).toThrowError()
        expect(() => router.register("/{parameter", handler)).toThrowError()
        expect(() => router.register("/{{parameter}}", handler)).toThrowError()
        expect(() => router.register("/invlid{parameter}", handler)).toThrowError()
        expect(() => router.register("/ /is/not/valid", handler)).toThrowError()
        expect(() => router.register("/cannot/**/terminate", handler)).toThrowError()
        expect(() => router.register("/*t", handler)).toThrowError()
        expect(() => router.register("/t*", handler)).toThrowError()

        router.register("/one/{two}/three", handler)
        expect(() => router.register("/one/*/three", handler)).toThrowError()

    })

    test('A router should accept valid templates', () => {
        const router = createRouter()
        const handler: HttpHandler<any, any> = (_request) => Promise.reject("invalid")

        router.register("/valid", handler)
        router.register("/this/is/a/valid/handler/", handler)
        router.register("/{parameter}/should/work", handler)
        router.register("/{multiple}/parameters/{should}/work", handler)
        router.register("/terminal/**", handler)
        router.register("/wildcards/*/should/be/{accepted}/**", handler)

        expect(router.lookup(request("/valid"))).not.toBeUndefined()
    })

    test('A router should accept a top level terminal', () => {
        const router = createRouter()
        const handler: HttpHandler<any, any> = (_request) => Promise.reject("invalid")

        router.register("/**", handler)

        expect(router.lookup(request("/foo"))).not.toBeUndefined()
        expect(router.lookup(request("/foo/bar"))).not.toBeUndefined()
        expect(router.lookup(request("/foo/bar/baz"))).not.toBeUndefined()

    })

    test('A router should accept a top level wildcard', () => {
        const router = createRouter()
        const handler: HttpHandler<any, any> = (_request) => Promise.reject("invalid")

        router.register("/*", handler)

        expect(router.lookup(request("/bar/baz"))).toBeUndefined()
        expect(router.lookup(request("/bar"))).not.toBeUndefined()
    })
});