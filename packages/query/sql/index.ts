/**
 * Representation for relational data stores where the connections between
 * objects has meaning
 */

import type { QueryBuilder, RowType } from "../index"

/**
 * Represents a table schema which can have named columns and values
 */
export type SQLDataTable = RowType

/**
 * Represents a relational data store that has a collection of tables and other
 * objects that can be useful for describing data sources and building valid queries
 */
export interface SQLDataStore {
  tables: Record<string, SQLDataTable>
}

/** Sentinel indicator for all columns */
export type STAR = "*"

export type RelationalQueryBuilder<_D extends SQLDataStore> = QueryBuilder
