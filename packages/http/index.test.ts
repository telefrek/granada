import * as http2 from 'http2';
import { HttpRequest, HttpServer, createRouter, getDefaultBuilder } from "./index";

describe('HttpServer functionality should work as expected', () => {
    let server: HttpServer

    beforeAll(() => {
        const router = createRouter()
        router.register("/hello", (request: HttpRequest<any>) => {
            return Promise.resolve(request.respond(200, () => Promise.resolve("Hello World")))
        })

        server = getDefaultBuilder().withRouter(router).build()
        expect.any(server)

        server.listen(8080)
    })

    afterAll(async () => {
        await server.close()
    })

    test('A server should be able to respond to simple calls', async () => {

        expect(await new Promise((resolve, reject) => {
            const client = http2.connect('http://localhost:8080')
            const req = client.request({ ':path': '/hello' })

            req.on('response', (headers) => {
                if (200 !== headers[http2.constants.HTTP2_HEADER_STATUS] as any) {
                    reject(new Error(`Invalid status ${headers[http2.constants.HTTP2_HEADER_STATUS]} (${typeof headers[http2.constants.HTTP2_HEADER_STATUS]})`))
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

        expect(await new Promise((resolve, reject) => {
            const client = http2.connect('http://localhost:8080')
            const req = client.request({ ':path': '/world' })

            req.on('response', (headers) => {
                const status = headers[http2.constants.HTTP2_HEADER_STATUS]
                if (404 !== headers[http2.constants.HTTP2_HEADER_STATUS] as any) {
                    reject(new Error(`Invalid status ${headers[http2.constants.HTTP2_HEADER_STATUS]} (${typeof headers[http2.constants.HTTP2_HEADER_STATUS]})`))
                }
            })

            let data = ''
            req.on('data', (chunk) => data += chunk)
            req.on('end', () => {
                client.close()
                resolve(data)
            })
            req.end()

        })).toEqual("")
    })
})