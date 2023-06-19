import { HttpHandler, HttpMethod, HttpResponse, emptyHeaders } from "../core";
import { createRouter } from "./index";


describe('verify router', () => {
    test('A router should not accept invalid templates', () => {
        const router = createRouter()
        const handler: HttpHandler = (_request) => Promise.reject("invalid")

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
        const handler: HttpHandler = (_request) => Promise.reject("invalid")

        router.register("/valid", handler)
        router.register("/this/is/a/valid/handler/", handler)
        router.register("/{parameter}/should/work", handler)
        router.register("/{multiple}/parameters/{should}/work", handler)
        router.register("/terminal/**", handler)
        router.register("/wildcards/*/should/be/{accepted}/**", handler)

        expect(router.lookup({ path: "/valid", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no"), respond: () => <HttpResponse<any>>{} })).not.toBeUndefined()
    })

    test('A router should accept a top level terminal', () => {
        const router = createRouter()
        const handler: HttpHandler = (_request) => Promise.reject("invalid")

        router.register("/**", handler)

        expect(router.lookup({ path: "/foo", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no"), respond: () => <HttpResponse<any>>{} })).not.toBeUndefined()
        expect(router.lookup({ path: "/foo/bar", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no"), respond: () => <HttpResponse<any>>{} })).not.toBeUndefined()
        expect(router.lookup({ path: "/foo/bar/baz", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no"), respond: () => <HttpResponse<any>>{} })).not.toBeUndefined()

    })

    test('A router should accept a top level wildcard', () => {
        const router = createRouter()
        const handler: HttpHandler = (_request) => Promise.reject("invalid")

        router.register("/*", handler)

        expect(router.lookup({ path: "/bar/baz", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no"), respond: () => <HttpResponse<any>>{} })).toBeUndefined()
        expect(router.lookup({ path: "/bar", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no"), respond: () => <HttpResponse<any>>{} })).not.toBeUndefined()
    })
});