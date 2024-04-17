import { existsSync, mkdtempSync, rm, rmSync, writeFileSync } from "fs"
import { join } from "path"
import {
  FileSystemConfigurationManager,
  type ConfigurationItem,
} from "./configuration.js"
import { DeferredPromise } from "./index.js"
import { ConsoleLogWriter, LogLevel } from "./logging.js"
import { delay } from "./time.js"

describe("configuration should work for basic file system integrations", () => {
  let directory: string = "/this/dir/should/not/exist"
  let manager: FileSystemConfigurationManager | undefined

  beforeAll(() => {
    directory = mkdtempSync("granada-test", "utf8")
  })

  afterAll(() => {
    // Release the resources
    if (manager) {
      manager.close()
    }

    if (existsSync(directory)) {
      rmSync(directory, {
        recursive: true,
        force: true,
      })
    }
  })

  async function verifyEmpty(): Promise<void> {
    const config = await manager!.getConfiguration("foo")
    expect(config).toBeUndefined()
    expect(Array.from(manager!.getKeys()).length).toBe(0)
  }

  it("Testing empty configuration directory", async () => {
    manager = new FileSystemConfigurationManager({
      configDirectory: directory,
    })

    await verifyEmpty()
  })

  it("Should fire events when files are added or removed", async () => {
    manager = new FileSystemConfigurationManager({
      configDirectory: directory,
      logWriter: new ConsoleLogWriter(),
      logLevel: LogLevel.DEBUG,
    })

    await verifyEmpty()

    interface TestItem {
      name: string
      createdAt: number
      lastModifiedAt: number
    }

    const item: ConfigurationItem<TestItem> = {
      key: "foo",
      item: {
        name: "fooObj",
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
      },
    }

    let lastChangedKey: string | undefined

    manager.once("added", (key) => {
      lastChangedKey = key
    })

    // Create the file
    writeFileSync(join(directory, "foo.json"), JSON.stringify(item), {
      encoding: "utf8",
      flush: true,
    })

    await delay(50)

    // Verify we saw the key change
    expect(lastChangedKey).not.toBeUndefined()
    expect(lastChangedKey).toEqual(item.key)

    expect(await manager.getConfiguration(item.key)).not.toBeUndefined()

    lastChangedKey = undefined
    manager.once("removed", (key) => {
      lastChangedKey = key
    })

    const deferred = new DeferredPromise()
    rm(join(directory, "foo.json"), { force: true }, (_) => {
      deferred.resolve(undefined)
    })

    await deferred

    expect(lastChangedKey).not.toBeUndefined()
    expect(lastChangedKey).toEqual(item.key)

    expect(await manager.getConfiguration(item.key)).toBeUndefined()
  })
})
