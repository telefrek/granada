import { HttpHandler, HttpMethod, HttpRequest, createRouter, emptyHeaders, getDefaultBuilder } from "./index"


describe('HttpServer functionality should work as expected', () => {

    test('A server should be buildable', async () => {
        const router = createRouter()
        router.register("/**", (request: HttpRequest<any>) => {
            return Promise.resolve(request.respond(200, () => Promise.resolve("Hello World")))
        })

        const server = getDefaultBuilder().withRouter(router).build()
        expect.any(server)

        server.listen(8080)

        await server.close()
    })
});