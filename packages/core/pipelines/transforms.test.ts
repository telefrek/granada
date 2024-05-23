/**
 * Tests for the transforms
 */

import EventEmitter, { on } from "events"
import { Readable, Transform, Writable } from "stream"
import { pipeline } from "stream/promises"
import { EmitterFor, type Emitter } from "../events.js"
import type { TaskCompletionEvents } from "../tasks.js"
import { Duration, delay } from "../time.js"
import { DynamicConcurrencyTransform } from "./transforms.js"

describe("Transforms should work as expected so pipelines can abstract them", () => {
  describe("Dynamic transforms should work as expected", () => {
    it("Should adjust the max number based on feedback", async () => {
      const generator = new EventEmitter()
      const controller = new AbortController()

      const readable = Readable.from(
        on(generator, "test", { signal: controller.signal }),
        { objectMode: true },
      )

      class TestTask
        extends EmitterFor<TaskCompletionEvents>
        implements Emitter<TaskCompletionEvents>
      {
        constructor() {
          super()
        }

        complete(duration: Duration, success: boolean) {
          this.emit("completed", duration, success)
        }
      }

      const dynamicTransform = new DynamicConcurrencyTransform<TestTask>(
        (task) => task,
      )

      const writer = new Writable({
        objectMode: true,
        write: (task: TestTask, _buffer, callback) => {
          return callback()
        },
      })

      const pipelinePromise = pipeline(
        readable,
        new Transform({
          objectMode: true,
          transform(chunk, encoding, callback) {
            return callback(undefined, chunk[0])
          },
        }),
        dynamicTransform,
        writer,
      )

      for (let waves = 0; waves < 5; ++waves) {
        const tasks: TestTask[] = []

        for (let n = 0; n < 1_000; ++n) {
          const task = new TestTask()
          generator.emit("test", task)
          tasks.push(task)
        }

        await delay(10)

        for (const task of tasks) {
          task.complete(Duration.ofMilli(waves * 250), true)
        }
      }

      readable.push(null)

      const timeout = setTimeout(() => {
        controller.abort("timeout")
      }, 3_000)
      await pipelinePromise
      clearTimeout(timeout)

      await delay(10)
    }, 10_000)
  })
})
