/**
 * Utilities for HTTP operations
 */

import { Readable } from "stream"
import { HttpRequest, HttpResponse } from "./index.js"

import { DeferredPromise } from "@telefrek/core/index.js"

export function readHttpRequest(_stream: Readable): Promise<HttpRequest> {
  const deferred = new DeferredPromise<HttpRequest>()

  return deferred
}

export function readHttpResponse(_stream: Readable): Promise<HttpResponse> {
  const deferred = new DeferredPromise<HttpResponse>()

  return deferred
}
