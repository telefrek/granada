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
  HttpResponse,
  HttpVersion,
  emptyHeaders,
} from "."

export class TestRequest extends EventEmitter implements HttpRequest {
  path: HttpPath
  method: HttpMethod
  headers: HttpHeaders = emptyHeaders()
  version: HttpVersion
  query?: HttpQuery | undefined
  body?: HttpBody | undefined
  respond(response: HttpResponse): void {
    this.emit("response", response)
  }

  constructor(args: {
    path: HttpPath
    query?: HttpQuery
    method?: HttpMethod
    version?: HttpVersion
    headers?: HttpHeaders
    body?: HttpBody
  }) {
    super()
    this.path = args.path
    this.query = args.query
    this.method = args.method ?? HttpMethod.GET
    this.version = args.version ?? HttpVersion.HTTP1_1
    this.headers = args.headers ?? emptyHeaders()
    this.body = args.body
  }
}
