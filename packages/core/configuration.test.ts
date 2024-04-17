import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import {
  FileSystemConfigurationManager,
  type ConfigurationItem,
  type ConfigurationManager,
} from "./configuration.js"
import { ConsoleLogWriter, DefaultLogger, LogLevel } from "./logging.js"
import { delay } from "./time.js"

const logger = new DefaultLogger({
  writer: new ConsoleLogWriter(),
  source: "configTest",
  level: LogLevel.DEBUG,
})

describe("configuration should work for basic file system integrations", () => {
  let directory: string = "/this/dir/should/not/exist"
  let manager: ConfigurationManager | undefined

  beforeAll(() => {
    directory = mkdtempSync("granada-test", "utf8")
  })

  afterAll(async () => {
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

    await delay(50)
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
      logger.info(`added: ${key}`)
      lastChangedKey = key
    })

    const file = join(directory, "foo.json")

    // Create the file
    writeFileSync(file, JSON.stringify(item), {
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
      logger.info(`removed: ${key}`)
      lastChangedKey = key
    })

    rmSync(file, { force: true })
    logger.info(`Deleted ${file}`)

    await delay(500)

    expect(lastChangedKey).not.toBeUndefined()
    expect(lastChangedKey).toEqual(item.key)

    expect(await manager.getConfiguration(item.key)).toBeUndefined()
  })
})
