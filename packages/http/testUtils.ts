/**
 * Set of classes that are used for testing only
 */

import EventEmitter from "events"
import {
  HttpBody,
  HttpHeaders,
  HttpMethod,
  HttpPath,
  HttpQuery,
  HttpRequest,
  HttpRequestState,
  HttpResponse,
  HttpVersion,
  emptyHeaders,
} from "./index.js"

export class TestRequest extends EventEmitter implements HttpRequest {
  path: HttpPath
  method: HttpMethod
  state: HttpRequestState
  headers: HttpHeaders = emptyHeaders()
  version: HttpVersion
  query?: HttpQuery | undefined
  body?: HttpBody | undefined
  respond(response: HttpResponse): void {
    this.emit("response", response)
  }

  constructor(args: Partial<HttpRequest>) {
    super()
    this.path = args.path ?? { original: "/", segments: [] }
    this.query = args.query
    this.state = args.state ?? HttpRequestState.PENDING
    this.method = args.method ?? HttpMethod.GET
    this.version = args.version ?? HttpVersion.HTTP1_1
    this.headers = args.headers ?? emptyHeaders()
    this.body = args.body
  }
}
