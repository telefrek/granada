/**
 * Representation for relational data stores where the connections between
 * objects has meaning
 */

import type { DataStore } from ".."

/**
 * Represents a table schema which can have named columns and values
 */
export type RelationalDataTable = Record<string, any>

/**
 * Represents a relational data store that has a collection of tables and other
 * objects that can be useful for describing data sources and building valid queries
 */
export interface RelationalDataStore extends DataStore {
  tables: { [key: string]: RelationalDataTable }
}
