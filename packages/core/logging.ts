/**
 * Logging interfaces
 */

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

let DEFAULT_LOG_LEVEL: LogLevel = LogLevel.INFO

export function setDefaultLogLevel(level: LogLevel): void {
  DEFAULT_LOG_LEVEL = level
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

let DEFAULT_WRITER: LogWriter = NoopLogWriter

/**
 * Sets the default log writer for preparing the infra
 *
 * @param writer The {@link LogWriter} to use for new log creation
 */
export function setDefaultWriter(writer: LogWriter): void {
  DEFAULT_WRITER = writer

  // Update the global writer to use the default
  GLOBAL_LOGGER = new DefaultLogger({
    name: GLOBAL_LOGGER.name,
    writer,
    level: GLOBAL_LOGGER.level,
  })
}

/**
 * Simple interface for logging information
 */
export interface Logger {
  /** The current {@link LogLevel} */
  readonly level: LogLevel

  /** The source for events logged here */
  readonly name?: string

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
  name?: string
  /** Optional {@link LogWriter} with default of {@link NoopLogWriter} */
  writer?: LogWriter
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
 * Helpers for optimizing log levels
 */
type MessageLogger = (message: string, context?: unknown) => void
const NO_OP_LOGGER: MessageLogger = (
  _message: string,
  _context?: unknown,
): void => {}

/**
 * Simple logger that translates between levels and registers for global hooks
 */
export class DefaultLogger implements Logger {
  private _level: LogLevel
  private _writer: LogWriter
  readonly name?: string

  debug: MessageLogger
  info: MessageLogger
  warn: MessageLogger
  error: MessageLogger
  fatal: MessageLogger

  constructor(options?: LoggerOptions) {
    this._level = options?.level ?? DEFAULT_LOG_LEVEL
    this._writer = options?.writer ?? DEFAULT_WRITER
    this.name = options?.name

    // Set the loggers to no-op mode
    this.debug = NO_OP_LOGGER
    this.info = NO_OP_LOGGER
    this.warn = NO_OP_LOGGER
    this.error = NO_OP_LOGGER
    this.fatal = this._fatal.bind(this)

    this.setLevel(this._level)
  }

  get level(): LogLevel {
    return this._level
  }

  setLevel(level: LogLevel): void {
    this._reset()
    this._level = level

    // Rebind the statements from the no-op
    switch (level) {
      case LogLevel.DEBUG:
        this.debug = this._debug.bind(this)
      // eslint-disable-next-line no-fallthrough
      case LogLevel.INFO:
        this.info = this._info.bind(this)
      // eslint-disable-next-line no-fallthrough
      case LogLevel.WARN:
        this.warn = this._warn.bind(this)
      // eslint-disable-next-line no-fallthrough
      case LogLevel.ERROR:
        this.error = this._error.bind(this)
        break
    }
  }

  /**
   * Set all statements besides fatal to the NO_OP_LOGGER
   */
  private _reset(): void {
    this.debug = NO_OP_LOGGER
    this.info = NO_OP_LOGGER
    this.warn = NO_OP_LOGGER
    this.error = NO_OP_LOGGER
  }

  private _debug(message: string, context?: unknown): void {
    this._writer.log({
      source: this.name,
      timestamp: HiResClock.timestamp(),
      message,
      level: LogLevel.DEBUG,
      context,
    })
  }

  private _info(message: string, context?: unknown): void {
    this._writer.log({
      source: this.name,
      timestamp: HiResClock.timestamp(),
      message,
      level: LogLevel.INFO,
      context,
    })
  }

  private _warn(message: string, context?: unknown): void {
    this._writer.log({
      source: this.name,
      timestamp: HiResClock.timestamp(),
      message,
      level: LogLevel.WARN,
      context,
    })
  }

  private _error(message: string, context?: unknown): void {
    this._writer.log({
      source: this.name,
      timestamp: HiResClock.timestamp(),
      message,
      level: LogLevel.ERROR,
      context,
    })
  }

  private _fatal(message: string, context?: unknown): void {
    this._writer.log({
      source: this.name,
      timestamp: HiResClock.timestamp(),
      message,
      level: LogLevel.FATAL,
      context,
    })
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
 * Attempts to update the global logging levels
 *
 * @param level The new {@link LogLevel} to set globally
 */
export function setGlobalLogLevel(level: LogLevel): void {
  GLOBAL_LOGGER.setLevel(level)
}

export function setGlobalWriter(writer: LogWriter): void {
  GLOBAL_LOGGER = new DefaultLogger({
    name: "global",
    level: GLOBAL_LOGGER.level,
    writer,
  })
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
  name: "global",
  writer: NoopLogWriter,
})
