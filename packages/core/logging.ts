/**
 * Logging interfaces
 */

import { EventEmitter } from "events"
import type { Emitter } from "./events.js"
import { HiResClock, type Timestamp } from "./time.js"

/**
 * Levels for logging information
 */
export enum LogLevel {
  FATAL = 0,
  ERROR = 10,
  WARN = 20,
  INFO = 30,
  DEBUG = 40,
}

/**
 * Defines some simple structure for log information
 */
export interface LogData {
  level: LogLevel
  message: string
  timestamp?: Timestamp
  source?: string
  context?: unknown
}

/**
 * Formatter for {@link LogData} entries
 */
export type LogFormatter = (data: LogData) => string

/**
 * Simple format for {@link LogData} objects
 *
 * @param data The {@link LogData} to format
 * @returns A string with the time, source, level and message
 */
export const SimpleLogFormatter: LogFormatter = (data: LogData) =>
  `${data.timestamp ? `[${data.timestamp.toISOString()}]:` : ""}${data.source ? `(${data.source}) ` : ""}${ReadableLogLevels[data.level]} - ${data.message}`

/**
 * Simple interface for writing {@link LogData} to some source
 */
export interface LogWriter {
  /**
   * Writes the {@link LogData} to the underlying source
   *
   * @param data The {@link LogData} to write
   */
  log(data: LogData): void
}

/**
 * {@link LogWriter} that does nothing
 */
export const NoopLogWriter: LogWriter = {
  log(_data: LogData): void {},
}

/**
 * Simple interface for logging information
 */
export interface Logger {
  /** The current {@link LogLevel} */
  readonly level: LogLevel

  /** The source for events logged here */
  readonly source?: string

  /**
   * Update the {@link LogLevel} minimum to write with
   * @param level The new {@link LogLevel} to use
   */
  setLevel(level: LogLevel): void

  /**
   * Writes a {@link LogLevel.DEBUG} event
   *
   * @param message The message to log
   * @param context The additional context for the message
   */
  debug(message: string, context?: unknown): void

  /**
   * Writes a {@link LogLevel.INFO} event
   *
   * @param message The message to log
   * @param context The additional context for the message
   */
  info(message: string, context?: unknown): void

  /**
   * Writes a {@link LogLevel.WARN} event
   *
   * @param message The message to log
   * @param context The additional context for the message
   */
  warn(message: string, context?: unknown): void

  /**
   * Writes a {@link LogLevel.ERROR} event
   *
   * @param message The message to log
   * @param context The additional context for the message
   */
  error(message: string, context?: unknown): void

  /**
   * Writes a {@link LogLevel.FATAL} event
   *
   * @param message The message to log
   * @param context The additional context for the message
   */
  fatal(message: string, context?: unknown): void
}
/**
 * Options for configuring loggers
 */
export interface LoggerOptions {
  /** Optional {@link LogLevel} for initial logging, default is {@link LogLevel.ERROR} */
  level?: LogLevel
  /** Optional source for the logs */
  source?: string
  /** Optional {@link LogWriter} with default of {@link NoopLogWriter} */
  writer?: LogWriter
  /** Flat to indicate if timestamps should be collected (default is true) */
  includeTimestamps?: boolean
}

/**
 * Simple {@link LogWriter} that outputs to the console
 */
export class ConsoleLogWriter implements LogWriter {
  private _formatter: LogFormatter

  constructor(formatter?: LogFormatter) {
    this._formatter = formatter ?? SimpleLogFormatter
  }

  log(data: LogData): void {
    // eslint-disable-next-line no-console
    console.log(this._formatter(data))
  }
}

/**
 * Simple logger that translates between levels and registers for global hooks
 */
export class DefaultLogger implements Logger {
  private _level: LogLevel
  private _writer: LogWriter
  private _injectTimestamp: boolean
  readonly source?: string

  constructor(options?: LoggerOptions) {
    this._level = options?.level ?? LogLevel.ERROR
    this._writer = options?.writer ?? NoopLogWriter
    this._injectTimestamp = options?.includeTimestamps ?? true
    this.source = options?.source

    // Bind to the global log changes
    GLOBAL_LOG_EVENTS.on("levelChanged", this.setLevel.bind(this))
  }

  get level(): LogLevel {
    return this._level
  }

  setLevel(level: LogLevel): void {
    this._level = level
  }

  debug(message: string, context?: unknown): void {
    if (this._level >= LogLevel.DEBUG) {
      this._writer.log({
        source: this.source,
        timestamp: this._injectTimestamp ? HiResClock.timestamp() : undefined,
        message,
        level: LogLevel.DEBUG,
        context,
      })
    }
  }

  info(message: string, context?: unknown): void {
    if (this._level >= LogLevel.INFO) {
      this._writer.log({
        source: this.source,
        timestamp: this._injectTimestamp ? HiResClock.timestamp() : undefined,
        message,
        level: LogLevel.INFO,
        context,
      })
    }
  }

  warn(message: string, context?: unknown): void {
    if (this._level >= LogLevel.WARN) {
      this._writer.log({
        source: this.source,
        timestamp: this._injectTimestamp ? HiResClock.timestamp() : undefined,
        message,
        level: LogLevel.WARN,
        context,
      })
    }
  }

  error(message: string, context?: unknown): void {
    if (this._level >= LogLevel.ERROR) {
      this._writer.log({
        source: this.source,
        timestamp: this._injectTimestamp ? HiResClock.timestamp() : undefined,
        message,
        level: LogLevel.ERROR,
        context,
      })
    }
  }

  fatal(message: string, context?: unknown): void {
    if (this._level >= LogLevel.FATAL) {
      this._writer.log({
        source: this.source,
        timestamp: this._injectTimestamp ? HiResClock.timestamp() : undefined,
        message,
        level: LogLevel.FATAL,
        context,
      })
    }
  }
}

/**
 * Levels to strings
 */
const ReadableLogLevels = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.FATAL]: "FATAL",
} as const

/**
 * Interface to define global log events
 */
interface GlobalLogLevelEvents {
  /**
   * Signals a change to global logging levels
   *
   * @param level The new {@link LogLevel} to use globally
   */
  levelChanged(level: LogLevel): void
}

/**
 * Implementation of the {@link EventEmitter} for the {@link GlobalLogLevelEvents}
 */
class GlobalLogEvents
  extends EventEmitter
  implements Emitter<GlobalLogLevelEvents>
{
  constructor() {
    super()
  }
}

/**
 * Simple class to allow hooking for global logger events
 */
export const GLOBAL_LOG_EVENTS: GlobalLogEvents = new GlobalLogEvents()

/**
 * Attempts to update the global logging levels
 *
 * @param level The new {@link LogLevel} to set globally
 */
export function updateGlobalLevel(level: LogLevel): void {
  GLOBAL_LOG_EVENTS.emit("levelChanged", level)
}

/**
 * Allows customization of the global logger
 *
 * @param logger The {@link Logger} to use for global operations
 */
export function setGlobalLogger(logger: Logger): void {
  GLOBAL_LOGGER = logger
}

/**
 * Helper function that uses the global logger
 *
 * @param message The message to log
 * @param context The associated context
 */
export function debug(message: string, context?: unknown) {
  GLOBAL_LOGGER.debug(message, context)
}

/**
 * Helper function that uses the global logger
 *
 * @param message The message to log
 * @param context The associated context
 */
export function info(message: string, context?: unknown) {
  GLOBAL_LOGGER.info(message, context)
}

/**
 * Helper function that uses the global logger
 *
 * @param message The message to log
 * @param context The associated context
 */
export function warn(message: string, context?: unknown) {
  GLOBAL_LOGGER.warn(message, context)
}

/**
 * Helper function that uses the global logger
 *
 * @param message The message to log
 * @param context The associated context
 */
export function error(message: string, context?: unknown) {
  GLOBAL_LOGGER.error(message, context)
}

/**
 * Helper function that uses the global logger
 *
 * @param message The message to log
 * @param context The associated context
 */
export function fatal(message: string, context?: unknown) {
  GLOBAL_LOGGER.fatal(message, context)
}

let GLOBAL_LOGGER: Logger = new DefaultLogger({
  source: "global",
  writer: NoopLogWriter,
})
