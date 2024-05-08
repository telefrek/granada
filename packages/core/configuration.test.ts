import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import {
  FileSystemConfigurationManager,
  type ConfigurationItem,
  type ConfigurationManager,
} from "./configuration.js"
import { DeferredPromise } from "./index.js"
import { info } from "./logging.js"
import type { Optional } from "./type/utils.js"

describe("configuration should work for basic file system integrations", () => {
  let directory: string = "/this/dir/should/not/exist"
  let manager: Optional<ConfigurationManager>

  beforeAll(() => {
    directory = mkdtempSync("granada-test", "utf8")
  })

  afterEach(() => {
    if (manager) {
      manager.close()
    }
  })

  afterAll(() => {
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

    const file = join(directory, "foo.json")

    expect(await manager.getConfiguration(item.key)).toBeUndefined()

    let deferred = new DeferredPromise()

    manager.once("added", (_) => {
      deferred.resolve()
    })

    // Create the file
    writeFileSync(file, JSON.stringify(item), {
      encoding: "utf8",
      flush: true,
    })

    await deferred

    expect(await manager.getConfiguration(item.key)).not.toBeUndefined()
    deferred = new DeferredPromise()

    manager.once("removed", (_) => {
      deferred.resolve()
    })

    rmSync(file, { force: true })
    info(`Deleted ${file}`)

    await deferred

    expect(await manager.getConfiguration(item.key)).toBeUndefined()
  })
})
