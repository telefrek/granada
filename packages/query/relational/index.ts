/**
 * Representation for relational data stores where the connections between
 * objects has meaning
 */

import type { RowType } from "../query/index"

/**
 * Represents a table schema which can have named columns and values
 */
export type RelationalDataTable = RowType

/**
 * Represents a relational data store that has a collection of tables and other
 * objects that can be useful for describing data sources and building valid queries
 */
export interface RelationalDataStore {
  tables: Record<string, RelationalDataTable>
}

/** Sentinel indicator for all columns */
export type STAR = "*"
