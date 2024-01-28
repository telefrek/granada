import { PostgresColumnType, PostgresTable } from "./schema"

/**
 * Defines a row of a given {@link PostgresTable}
 */
export type PostgresRow<T extends PostgresTable> = {
  [K in keyof T["columns"]]: PostgresColumnType<T["columns"][K]>
}

export interface PostgresQuery {
  name: string
  text: string
}

export interface PostgresQueryResult<
  T extends PostgresTable,
  R extends PostgresRow<T>,
> {
  hasRows: boolean
  query: PostgresQuery
  rows: R[] | AsyncIterable<R>
}
