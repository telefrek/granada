/**
 * Type helpers for Relational Queries
 */

import type { RelationalDataStore, RelationalDataTable } from "./index"

/**
 * Merges the two types
 */
export type MergedType<A, B> = A & B

/**
 * Merges the two types such that keys in A override any keys in B
 */
export type MergedNonOverlappingType<A, B> = MergedType<
  A,
  { [K in keyof B]: K extends keyof A ? never : B[K] }
>

/**
 * A modiefied {@link RelationalDataStore} with a new key and table definition
 */
export interface ModifiedStore<
  Left extends RelationalDataStore,
  N extends string,
  RowType extends RelationalDataTable,
> {
  tables: {
    [key in keyof Left["tables"] | N]: key extends keyof Left["tables"]
      ? Left["tables"][key]
      : RowType
  }
}

/**
 * Helper to get properties of a given type
 */
export type PropertyOfType<
  TableType extends RelationalDataTable,
  TargetType,
> = {
  [K in keyof TableType]: TableType[K] extends TargetType ? K : never
}[keyof TableType]

/**
 * Type that extracts keys that are arrays or strings which are valid for
 * {@link ColumnValueContainsOperation} filters
 */
export type ArrayProperty<TableType extends RelationalDataTable> = {
  [K in keyof TableType]: TableType[K] extends unknown[] ? K : never
}[keyof TableType]

/**
 * Helper to extract the type from the given {@link ArrayProperty}
 */
export type ArrayItemType<
  TableType extends RelationalDataTable,
  Column extends ArrayProperty<TableType>,
> = TableType[Column] extends (infer ItemType)[] ? ItemType : never

/**
 * Helper to find the set of properties on the {@link Right} object that match
 * the type of the {@link LeftColumn} on the {@link Left} object
 */
export type MatchingProperty<
  Left extends RelationalDataTable,
  Right extends RelationalDataTable,
  LeftColumn extends keyof Left,
> = PropertyOfType<Right, Left[LeftColumn]>
