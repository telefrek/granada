import {HttpHandler, HttpMethod, HttpServer, emptyHeaders, getDefaultBuilder} from "./index"


describe('testing', () => {
    test('A test should run', async () => {

        const h: HttpHandler = (_request)=>Promise.resolve({
            status: 404,
            headers: emptyHeaders(),
            hasBody: false,
            body: ()=>Promise.reject(new Error("invalid"))
        })
        const response = await h({
            path: "/",
            method: HttpMethod.GET,
            headers: emptyHeaders(),
            hasBody: false,
            body: ()=>Promise.reject(new Error("invalid"))
        })
        expect(response.status).toBe(404);
    })

    test('A server should be buildable', () => {
        const server = getDefaultBuilder().build()
        expect.any(server)
    })
});