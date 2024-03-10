/**
 * Type helpers for Relational Queries
 */

import type { RelationalDataStore } from "./index"

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
export type ModifiedStore<
  Left extends RelationalDataStore,
  N extends string,
  RowType
> = {
  tables: { [key in keyof Left["tables"]]: Left["tables"][key] } & Record<
    N,
    RowType
  >
}

/**
 * The valid set of join types supported
 */
export enum JoinType {
  INNER = "inner",
  LEFT = "left",
  RIGHT = "right",
  FULL = "full",
}

/**
 * Represents different types of filters available
 */
export enum ColumnFilteringOperation {
  EQ = "=",
  LT = "<",
  GT = ">",
  LTE = "<=",
  GTE = ">=",
}

export enum ColumnValueContainsOperation {
  IN = "in",
}

/**
 * Represents different boolean operations available
 */
export enum BooleanOperation {
  AND = "and",
  OR = "or",
  NOT = "not",
}

/**
 * The supported types a {@link RelationalQueryNode} can have
 */
export enum RelationalNodeType {
  TABLE = "table",
  WHERE = "where",
  SELECT = "select",
  CTE = "cte",
  JOIN = "join",
  NONE = "none",
}

/**
 * Type that extracts keys that are arrays or strings which are valid for
 * {@link ColumnValueContainsOperation} filters
 */
export type ContainmentProperty<TableType> = {
  [K in keyof TableType]: TableType[K] extends Array<any>
    ? K
    : TableType[K] extends string
    ? K
    : never
}[keyof TableType]

/**
 * Helps to extract the type from the given {@link ContainmentProperty}
 */
export type ContainmentItemType<
  TableType,
  Column extends ContainmentProperty<TableType>
> = TableType[Column] extends (infer ItemType)[]
  ? ItemType
  : TableType[Column] extends string
  ? TableType[Column]
  : never

export type MatchingKey<Left, Right, LeftColumn extends keyof Left> = KeyofType<
  Right,
  Left[LeftColumn]
>

export type KeyofType<T, K> = {
  [key in keyof T]: T[key] extends K ? key : never
}[keyof T]
