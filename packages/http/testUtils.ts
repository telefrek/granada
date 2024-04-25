/**
 * Set of classes that are used for testing only
 */

import type { Context } from "@opentelemetry/api"
import type { Optional } from "@telefrek/core/type/utils.js"
import { randomUUID as v4 } from "crypto"
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
} from "./index.js"
import { emptyHeaders } from "./utils.js"

export class TestRequest extends EventEmitter implements HttpRequest {
  id: string = v4()
  path: HttpPath
  method: HttpMethod
  headers: HttpHeaders = emptyHeaders()
  version: HttpVersion
  query?: Optional<HttpQuery>
  body?: Optional<HttpBody>
  context: Optional<Context>

  drop(): void {}

  respond(response: HttpResponse): void {
    this.emit("response", response)
  }

  constructor(args: Partial<HttpRequest>) {
    super()
    this.path = args.path ?? { original: "/", segments: [] }
    this.query = args.query
    this.method = args.method ?? HttpMethod.GET
    this.version = args.version ?? HttpVersion.HTTP1_1
    this.headers = args.headers ?? emptyHeaders()
    this.body = args.body
    this.context = undefined
  }
}
