/**
 * Package for handling configuration in an application
 */

import EventEmitter from "events"
import type { Emitter } from "./events.js"
import { DeferredPromise, type MaybeAwaitable } from "./index.js"

import fs from "fs"
import path, { join } from "path"
import {
  DefaultLogger,
  type LogLevel,
  type LogWriter,
  type Logger,
} from "./logging.js"

export interface ConfigurationEvents {
  /**
   * Event fired when a configuration key is changed
   *
   * @param key The key that changed
   */
  changed(key: string): void

  /**
   * Event fired when a configuration key is removed
   *
   * @param key The key that was removed
   */
  removed(key: string): void

  /**
   * Event fired when a configuration key is added
   *
   * @param key The key that was added
   */
  added(key: string): void
}

/**
 * Manages configuration values
 */
export interface ConfigurationManager extends Emitter<ConfigurationEvents> {
  /**
   * Iterate over the known keys
   */
  getKeys(): IterableIterator<string>

  /**
   * Gets the configuration value associated with the given key or undefined
   *
   * @param configKey The key for the configuration to load
   * @param defaultValue The optional default value to return if the key is not found
   */
  getConfiguration<T>(
    configKey: string,
    defaultValue?: T,
  ): MaybeAwaitable<T | undefined>
}

/**
 * Required shape for configuration items managed by the {@link FileSystemConfigurationManager}
 */
export type ConfigurationItem<T extends object> = {
  /** The configuration key  */
  key: string

  /** The item contents associated with this key */
  item: T
}

/**
 * Options for the {@link FileSystemConfigurationManager}
 */
export interface FileSystemConfigurationManagerOptions {
  /** The directory to monitor (default is /etc/config) */
  configDirectory?: string
  /** The optional log writer to use */
  logWriter?: LogWriter
  /** Flag to load configurations on demand to reduce memory (default is false) */
  lazyLoad?: boolean
  /** The default logging level for this component */
  logLevel?: LogLevel
}

/**
 * Simple implementation of the {@link ConfigurationManager} that uses the local
 * file system
 */
export class FileSystemConfigurationManager
  extends EventEmitter
  implements ConfigurationManager, Disposable
{
  private readonly _configDirectory: string
  private readonly _abortController: AbortController

  private readonly _logger: Logger
  private readonly _watcher: fs.FSWatcher
  private readonly _lazyLoading: boolean

  // Maps to store the configuration state and objects
  private readonly _configMap: Map<string, unknown> = new Map()
  private readonly _configLocations: Map<string, string[]> = new Map()

  constructor(options: FileSystemConfigurationManagerOptions) {
    // Verify the configuration directory
    const configDirectory = options.configDirectory ?? "/etc/config"

    if (!fs.existsSync(configDirectory)) {
      throw new Error(`${configDirectory} does not exist`)
    }

    if (!fs.statSync(configDirectory).isDirectory()) {
      throw new Error(`${configDirectory} is not a valid directory`)
    }

    super()

    this._configDirectory = configDirectory
    this._abortController = new AbortController()
    this._logger = new DefaultLogger({
      source: "FileSystemConfigurationManager",
      writer: options.logWriter,
      level: options.logLevel,
    })

    this._lazyLoading = options.lazyLoad ?? false

    this._watcher = fs.watch(
      this._configDirectory,
      {
        encoding: "utf8",
        recursive: false, // TODO: Related to https://github.com/nodejs/node/issues/49995, need fix before recursive
        persistent: true,
        signal: this._abortController.signal,
      },
      (event: fs.WatchEventType, file: string | Buffer | null): void => {
        this._logger.debug(`${file} => ${event}`)
        // Get the fileName and check if it exists to map state
        let fileName = Buffer.isBuffer(file)
          ? file.toString("utf8")
          : typeof file === "string"
            ? file
            : ""

        // Check if there is a valid name here
        if (fileName && path.extname(fileName).endsWith("json")) {
          fileName = join(this._configDirectory, fileName)
          switch (event) {
            case "rename":
              if (fs.existsSync(fileName)) {
                this._loadConfig(fileName)
              } else {
                this._clearConfig(fileName)
              }
              break
            case "change":
              if (fs.existsSync(fileName)) {
                this._loadConfig(fileName)
              } else {
                this._clearConfig(fileName)
              }
              break
            default:
              this._logger.error(`Unknown FSWatcher event: ${event}`)
              break
          }
        }
      },
    )

    this._watcher.on("error", (err: Error) => {
      this._logger.error(`Error: ${err}`, err)
    })

    this._watcher.on("change", (e, f) => this._logger.debug(`chg: ${e} ${f}`))

    // Start the configuration loading process
    this._initialize()
  }

  [Symbol.dispose](): void {
    this.close()
  }

  close(): void {
    if (!this._abortController.signal.aborted) {
      this._abortController.abort("closing the manager")
    }
  }

  /**
   * Load all configuration values from the directory
   */
  private _initialize(): void {
    fs.readdir(
      this._configDirectory,
      {
        withFileTypes: true, // Get the directory entries
        recursive: true, // Recursively traverse the directory
      },
      (err: NodeJS.ErrnoException | null, files: fs.Dirent[]) => {
        if (err) {
          this._logger.error(`Load Configuration Error: ${err}`, err)
        } else {
          for (const f of files) {
            // Filter to only allow json files
            if (f.isFile() && path.extname(f.name).endsWith("json")) {
              const fileName = path.join(f.path, f.name)
              this._logger.debug(`Loading ${fileName}`)

              try {
                this._loadConfig(fileName)
              } catch (loadErr: unknown) {
                this._logger.error(
                  `Failed to load ${fileName}: ${loadErr}`,
                  loadErr,
                )
              }
            }
          }
        }
      },
    )
  }

  /**
   * Clear all configurations associated with the given file
   *
   * @param fileName The file to clear
   */
  private _clearConfig(fileName: string): void {
    this._logger.debug(`Clearing: ${fileName}`)
    const keys = this._configLocations.get(fileName) ?? []
    if (this._configLocations.delete(fileName)) {
      for (const key of keys) {
        if (this._configMap.delete(key)) {
          this._logger.debug(`Removed ${key}`)
          this.emit("removed", key)
        }
      }
    }
  }
  /**
   * Loads configurations from the file and fires events
   *
   * @param fileName The file to load
   */
  private _loadConfig(fileName: string): void {
    if (fs.statSync(fileName).isFile()) {
      fs.readFile(
        fileName,
        "utf8",
        (err: NodeJS.ErrnoException | null, data: string) => {
          if (err) {
            this._logger.error(`Failed to load file ${fileName}: ${err}`, err)
          } else {
            this._logger.info(`Loading ${fileName}`)
            try {
              // Parse the contents
              const contents = this.contentsAsItemArray(data)

              // Update the mapping for the objects in this file
              this._configLocations.set(
                fileName,
                contents.map((o) => o.key),
              )

              // Iterate through the keys
              for (const item of contents) {
                // Check the event type and set the value
                const event = this._configMap.has(item.key)
                  ? "changed"
                  : "added"

                // Either inject the key or the file location
                this._configMap.set(
                  item.key,
                  this._lazyLoading ? fileName : item.item,
                )

                this._logger.debug(`${item.key} => ${event}`)
                // Emit the update
                this.emit(event, item.key)
              }
            } catch (parseErr) {
              this._logger.error(
                `(${fileName}) Invalid file contents: ${parseErr}`,
              )
            }
          }
        },
      )
    } else {
      this._logger.warn(
        `Tried to load configuration from non-file: ${fileName}`,
      )
    }
  }

  getKeys(): IterableIterator<string> {
    return this._configMap.keys()
  }

  getConfiguration<T>(
    configKey: string,
    defaultValue?: T,
  ): MaybeAwaitable<T | undefined> {
    if (this._lazyLoading) {
      const fileName = this._configMap.get(configKey) as string
      if (fileName && fs.existsSync(fileName)) {
        const promise = new DeferredPromise<T | undefined>()
        fs.readFile(
          fileName,
          "utf8",
          (err: NodeJS.ErrnoException | null, data: string) => {
            if (err) {
              this._logger.debug(`Failed to lazy load ${fileName}: ${err}`, err)
              promise.resolve(defaultValue)
            }

            const contents = this.contentsAsItemArray(data)
            promise.resolve(
              (contents as ConfigurationItem<object>[])
                .filter((i) => i.key === configKey)
                .at(0)?.item as T,
            )
          },
        )
      }

      return defaultValue
    }

    return (this._configMap.get(configKey) as T) ?? defaultValue
  }

  /**
   * Load the file contents assuming they are formatted as a single
   * {@link ConfigurationItem} or array
   *
   * @param contents The file contents
   * @returns An array of {@link ConfigurationItem} loaded from the file
   */
  private contentsAsItemArray(contents: string): ConfigurationItem<object>[] {
    try {
      const json = JSON.parse(contents)
      if (Array.isArray(json)) {
        return json as ConfigurationItem<object>[]
      } else if (typeof json === "object" && json) {
        return [json as ConfigurationItem<object>]
      }
    } catch (err) {
      this._logger.debug(`Failure to decode contents`)
    }

    return []
  }
}
