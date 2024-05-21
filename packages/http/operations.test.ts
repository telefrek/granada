/**
 * Testing HttpOperation expectations
 */

import { getTracer } from "@telefrek/core/observability/tracing"
import { drain } from "@telefrek/core/streams"
import { Duration, delay } from "@telefrek/core/time"
import { HttpErrorCode } from "./errors.js"
import { HttpOperationState, createHttpOperation } from "./operations.js"
import { createRequest, jsonBody, jsonContents, noContents } from "./utils.js"

describe("Http Operations should correctly manage the state machine", () => {
  afterAll(async () => await delay(25))
  it("Should handle stage progression through an empty request to success", () => {
    const operation = createHttpOperation({
      request: createRequest({}),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofMilli(10),
    })

    let finished = false
    operation.once("finished", () => (finished = true))

    expect(operation.state).toBe(HttpOperationState.QUEUED)
    expect(operation.dequeue()).toBeTruthy()

    // No body should skip to processing
    expect(operation.state).toBe(HttpOperationState.PROCESSING)

    // Complete the operation with no body
    expect(operation.complete(noContents())).toBeTruthy()
    expect(operation.state).toBe(HttpOperationState.COMPLETED)
    expect(operation.response).not.toBeUndefined()
    expect(finished).toBeTruthy()
  })

  it("Should handle stage progression through a request with a body", async () => {
    const operation = createHttpOperation({
      request: createRequest({ body: jsonBody({ foo: "bar" }) }),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofMilli(10),
    })
    let finished = false
    operation.once("finished", () => (finished = true))

    expect(operation.state).toBe(HttpOperationState.QUEUED)
    expect(operation.dequeue()).toBeTruthy()

    // Should be in reading now until the body is consumed
    expect(operation.state).toBe(HttpOperationState.READING)
    await drain(operation.request.body!.contents)

    // Should be processing now
    expect(operation.state).toBe(HttpOperationState.PROCESSING)

    // Complete the operation with a body
    expect(operation.complete(jsonContents({ bar: "foo" }))).toBeTruthy()
    expect(operation.response).not.toBeUndefined()

    // Should be in writing until consumed
    expect(operation.state).toBe(HttpOperationState.WRITING)
    expect(finished).toBeFalsy()

    // Ensure timeout has expired and it should still be writing...
    await delay(10)
    expect(operation.state).toBe(HttpOperationState.WRITING)
    expect(finished).toBeFalsy()

    await drain(operation.response!.body!.contents)
    expect(operation.state).toBe(HttpOperationState.COMPLETED)
    expect(finished).toBeTruthy()
  })

  it("Should timeout if not completed in time", async () => {
    const operation = createHttpOperation({
      request: createRequest(),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofMilli(10),
    })

    // Track setting the response
    let responded = false
    operation.once("response", () => {
      responded = true
    })

    let finished = false
    operation.once("finished", () => (finished = true))

    await delay(11)

    expect(operation.state).toBe(HttpOperationState.TIMEOUT)
    expect(responded).toBeFalsy()
    expect(operation.response).toBeUndefined()

    // The response should be a retryable error since we don't know that this is systemic
    expect(operation.error?.errorCode).toBe(HttpErrorCode.TIMEOUT)
    expect(finished).toBeTruthy()
  })

  it("Should handle failures correctly", async () => {
    let operation = createHttpOperation({
      request: createRequest(),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofSeconds(10),
    })

    let responded = false
    operation.once("response", () => (responded = true))

    // No reason given
    operation.fail()

    // Operation should have a failure response
    expect(responded).toBeFalsy()
    // Shouldn't be able to dequeue
    expect(operation.dequeue()).toBeFalsy()
    expect(operation.state).toBe(HttpOperationState.ABORTED)
    expect(operation.error).toBeUndefined()

    // Reset
    operation = createHttpOperation({
      request: createRequest(),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofMilli(10),
    })
    responded = false
    operation.once("response", () => (responded = true))

    expect(operation.dequeue()).toBeTruthy()
    expect(operation.dequeue()).toBeFalsy()
    expect(operation.fail({ errorCode: HttpErrorCode.ABORTED })).toBeTruthy()
    expect(operation.state).toBe(HttpOperationState.ABORTED)
    expect(operation.error).not.toBeUndefined()

    expect(responded).toBeFalsy()

    // Reset
    operation = createHttpOperation({
      request: createRequest(),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofMilli(10),
    })
    responded = false
    operation.once("response", () => (responded = true))

    expect(operation.dequeue()).toBeTruthy()
    expect(operation.dequeue()).toBeFalsy()
    expect(operation.fail({ errorCode: HttpErrorCode.TIMEOUT })).toBeTruthy()
    expect(operation.state).toBe(HttpOperationState.TIMEOUT)
    expect(operation.error).not.toBeUndefined()
    expect(responded).toBeFalsy()

    // Reset
    operation = createHttpOperation({
      request: createRequest(),
      span: getTracer().startSpan("test"),
      timeout: Duration.ofMilli(10),
    })
    responded = false
    operation.once("response", () => (responded = true))

    expect(operation.dequeue()).toBeTruthy()
    expect(operation.dequeue()).toBeFalsy()
    expect(operation.fail({ errorCode: HttpErrorCode.UNKNOWN })).toBeTruthy()
    expect(operation.state).toBe(HttpOperationState.ABORTED)
    expect(operation.error).not.toBeUndefined()
    expect(responded).toBeFalsy()
  })
})
