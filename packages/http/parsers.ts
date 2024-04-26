/**
 * Package that handles content parsing
 */

import { Readable, Transform } from "stream"
import { HttpBody, HttpHeaders } from "./index.js"
import { getMediaType } from "./media.js"

export function parseBody(headers: HttpHeaders, httpBody: HttpBody): void {
  httpBody.mediaType = getMediaType(headers)

  // TODO: Other checks for zipped contents, etc.

  if (httpBody.mediaType) {
    switch (httpBody.mediaType.type) {
      case "application":
        switch (true) {
          case "json" === httpBody.mediaType.subType:
            httpBody.contents = readBodyAsJson(httpBody.contents)
            break
        }
        break
    }
  }
}

function readBodyAsJson(readable: Readable): Readable {
  let data = ""

  // TODO: change this to tokens instead of buffering the entire string...
  const transform = new Transform({
    writableObjectMode: true,
    readableObjectMode: true,
    objectMode: true,
    transform(chunk, encoding, callback) {
      data += Buffer.isBuffer(chunk) ? chunk.toString(encoding) : chunk
      callback()
    },
    final(callback) {
      this.push(JSON.parse(data))
      callback()
    },
  })

  return readable.pipe(transform, { end: true })
}
