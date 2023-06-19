import * as http2 from 'http2';
import { HttpRequest, createRouter, getDefaultBuilder } from "./index";

describe('HttpServer functionality should work as expected', () => {

    test('A server should be buildable', async () => {
        const router = createRouter()
        router.register("/**", (request: HttpRequest<any>) => {
            return Promise.resolve(request.respond(200, () => Promise.resolve("Hello World")))
        })

        const server = getDefaultBuilder().withRouter(router).build()
        expect.any(server)

        server.listen(8080)

        expect(await new Promise((resolve, reject) => {
            const client = http2.connect('http://localhost:8080')
            const req = client.request({ ':path': '/hello' })

            req.on('response', (headers) => {
                if (headers[http2.constants.HTTP2_HEADER_STATUS] !== "200") {
                    reject(new Error(`Invalid status ${headers[http2.constants.HTTP2_HEADER_STATUS]}`))
                }
            })

            let data = ''
            req.on('data', (chunk) => data += chunk)
            req.on('end', () => {
                client.close()
                resolve(data)
            })
            req.end()

        })).toEqual("Hello World")
        await server.close()
    })
});