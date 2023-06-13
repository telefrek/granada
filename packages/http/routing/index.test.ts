import { createRouter } from "./index"
import { HttpHandler, HttpMethod, emptyHeaders } from "../core";


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

        router.register("/one/{two}/three", handler)
        expect(() => router.register("/one/*/three", handler)).toThrowError()

    })

    test('A router should not accept invalid templates', () => {
        const router = createRouter()
        const handler: HttpHandler = (_request) => Promise.reject("invalid")

        router.register("/valid", handler)
        router.register("/this/is/a/valid/handler/", handler)
        router.register("/{parameter}/should/work", handler)
        router.register("/{multiple}/parameters/{should}/work", handler)
        router.register("/terminal/**", handler)
        router.register("/wildcards/*/should/be/{accepted}/**", handler)

        expect(router.lookup({ path: "/valid", method: HttpMethod.GET, headers: emptyHeaders(), hasBody: false, body: () => Promise.reject("no") })).not.toBeNull()
    })
});