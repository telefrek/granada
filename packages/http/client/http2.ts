/**
 * HTTP2 Client implementation
 */

import { DeferredPromise, type MaybeAwaitable } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils.js"
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "http"
import {
  constants as Http2Constants,
  connect,
  type ClientHttp2Session,
  type IncomingHttpStatusHeader,
  type SecureClientSessionOptions,
} from "http2"
import {
  type HttpClientTransport,
  type HttpTransportOptions,
} from "../client.js"
import {
  HttpStatusCode,
  type HttpBody,
  type HttpRequest,
  type HttpResponse,
} from "../index.js"
import { extractHeaders, injectHeaders } from "../utils.js"

/**
 * A default HTTP2 client using the Node `http2` package
 */
export class Http2ClientTransport<T extends HttpTransportOptions>
  implements HttpClientTransport
{
  private _client: ClientHttp2Session

  constructor(config: T) {
    const options: SecureClientSessionOptions = {
      ca: config.tls?.certificateAuthority,
      key: config.tls?.privateKey,
      cert: config.tls?.publicCertificate,
    }

    this._client = connect(
      `https://${config.host}:${config.port ?? 443}`,
      options,
    )
  }

  marshal(
    request: HttpRequest,
    abort?: AbortSignal,
  ): MaybeAwaitable<HttpResponse> {
    const deferred = new DeferredPromise<HttpResponse>()

    try {
      const outgoingHeaders: OutgoingHttpHeaders = {
        [Http2Constants.HTTP2_HEADER_PATH]: request.path.original,
      }
      injectHeaders(request.headers, outgoingHeaders)

      const http2Stream = this._client
        .request(outgoingHeaders, {
          signal: abort,
        })
        .on("error", (err) => {
          deferred.reject(err)
        })
        .on("end", () => {
          if (!http2Stream.aborted && !http2Stream.closed) {
            http2Stream.close()
          }
        })
        .on(
          "response",
          (
            incomingHeaders: IncomingHttpHeaders & IncomingHttpStatusHeader,
            _,
          ) => {
            // Get the headers
            const headers = extractHeaders(incomingHeaders)
            const code: HttpStatusCode =
              incomingHeaders[":status"] ?? HttpStatusCode.INTERNAL_SERVER_ERROR

            // Assume no body...
            let body: Optional<HttpBody>

            switch (code) {
              // These shouldn't ever have anything
              case HttpStatusCode.NO_CONTENT:
              case HttpStatusCode.NOT_MODIFIED:
                break
              default:
                if (incomingHeaders["content-type"]) {
                  body = { contents: http2Stream }
                }
                break
            }

            deferred.resolve({
              status: {
                code,
              },
              headers,
              body,
            })
          },
        )
        .setDefaultEncoding("utf8")

      // Check if we need to write the body
      if (request.body) {
        request.body.contents.pipe(http2Stream, {
          end: true,
        })
      } else {
        http2Stream.end()
      }
    } catch (err) {
      deferred.reject(err)
    }

    return deferred
  }
}
