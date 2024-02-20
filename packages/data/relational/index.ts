/**
 * Representation for relational data stores where the connections between
 * objects has meaning
 */

import type { DataStore } from ".."

export type RelationalDataTable = Record<string, any>

export interface RelationalDataStore extends DataStore {
  tables: {
    [name: string]: RelationalDataTable
  }
}
