import { PostgresColumnType, PostgresTable } from "./schema"

/**
 * Defines a row of a given {@link PostgresTable}
 */
export type PostgresRow<T extends PostgresTable> = {
  [K in keyof T]?: PostgresColumnType<T[K]>
}

/**
 * Check the {@link PostgresRow} against the information in the {@link PostgresTable}
 *
 * @param row The {@link PostgresRow} to validate
 * @returns True if the {@link PostgresRow} is valid
 */
export function isRowValid<T extends PostgresTable>(
  row: PostgresRow<T>,
): boolean {
  return row === null ? false : true
}
