import { SynchronizedValue } from "../concurrency/index"
import { type MaybeAwaitable } from "../index"
import { delay, Duration } from "../time/index"
import { PoolBase } from "./pool"

type TestObject = {
  name: string
  id: number
  count: number
}

class TestPool extends PoolBase<TestObject> {
  static ITEM_ID: number = 0

  override checkIfValid(item: TestObject, reason?: unknown): boolean {
    return item.count++ < 4 && reason === undefined
  }

  override recycleItem(_item: TestObject): void {
    //console.log(`Recycling item ${item.id}`)
  }

  override createItem(): MaybeAwaitable<TestObject> {
    //console.log(`Creating item ${TestPool.ITEM_ID}`)
    return {
      name: "test object",
      id: TestPool.ITEM_ID++,
      count: 0,
    }
  }
}

describe("Pools should satisfy all runtime constraints expected", () => {
  it("Should be able to create and reuse items", async () => {
    const pool = new TestPool({
      maxSize: 10,
      retryAfterMs: 100,
      initialSize: 2,
      failureThreshold: 2,
    })

    expect(pool).not.toBeUndefined()
    expect(pool.size).toBe(0)

    const timeout = Duration.fromMilli(100)

    let item = await pool.get(timeout)
    expect(item).not.toBeUndefined()
    expect(item.item).not.toBeUndefined()
    expect(item.item.count).toBe(0)

    const previousId = item.item.id

    // Release the item
    item.release()

    // Verify that we got it back
    item = pool.get()
    expect(item.item.id).toBe(previousId)
    expect(item.item.count).toBe(1)

    // Verify the pool didn't change size
    expect(pool.size).toBe(1)
    item.release()

    for (let n = 0; n < 100; ++n) {
      item = await pool.get(timeout)

      // Verify the pool shouldn't change size but items should get recycled
      expect(pool.size).toBe(1)
      item.release()
    }

    // We should have gone through serveral recycling cycles
    item = await pool.get(timeout)
    expect(item.item.id).not.toEqual(previousId)
  })

  it("Should be able to scale the pool up and down", async () => {
    const pool = new TestPool({
      maxSize: 10,
      retryAfterMs: 100,
      initialSize: 2,
      failureThreshold: 2,
    })

    const timeout = Duration.fromMilli(20)

    async function runLoop(check: SynchronizedValue<boolean>): Promise<void> {
      for (; check.value; ) {
        try {
          const item = await pool.get(timeout)
          expect(item).not.toBeUndefined()

          await delay(5)

          item.release()
        } catch {
          await delay(25)
        }
      }
    }

    const loops: Promise<void>[] = []

    const check = new SynchronizedValue(true)

    for (let n = 0; n < 6; ++n) {
      loops.push(runLoop(check))

      await delay(100)
    }

    await delay(1000)

    check.value = false
    await Promise.allSettled(loops)
  })
})
