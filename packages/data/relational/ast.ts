/**
 * Extensions to the base query AST specific for relational data sources
 */

import type { OptionalProperties } from "@telefrek/core/type/utils"
import type { RelationalDataStore } from "."
import type { QueryNode, QuerySource } from "../query/ast"

export enum RelationalNodeTypes {
  TABLE = "table",
  WHERE = "where",
  SELECT = "select",
}

/**
 * Internal
 */
export interface RelationalQueryNode<T extends RelationalNodeTypes>
  extends QueryNode {
  nodeType: T
}

/**
 * Type guard for {@link RelationalQueryNode}
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link RelationalQueryNode}
 */
export function isRelationalQueryNode(
  node: QueryNode
): node is RelationalQueryNode<RelationalNodeTypes> {
  return typeof node === "object" && node !== null && "nodeType" in node
}

/**
 * Represents different types of filters available
 */
export enum FilterOp {
  EQ = "=",
  LT = "<",
  GT = ">",
  LTE = "<=",
  GTE = ">=",
}

export enum ContainmentOp {
  IN = "in",
}

/**
 * Represents different boolean operations available
 */
export enum BooleanOp {
  AND = "and",
  OR = "or",
  NOT = "not",
}

/**
 * Represents a filter on a given column like:`table.column {op} value`
 */
export interface ColumnFilter<T, K extends keyof T> {
  column: K
  op: FilterOp
  value: T[K]
}

/**
 * Type that extracts keys that are arrays or strings
 */
export type ContainmentProperty<T> = {
  [K in keyof T]: T[K] extends Array<any> ? K : T[K] extends string ? K : never
}[keyof T]

/**
 * Type that extracts the type of element at the containment property of T
 */
export type ContainmentItemType<
  T,
  K extends ContainmentProperty<T>
> = T[K] extends (infer U)[] ? U : T[K] extends string ? T[K] : never

/**
 * Special filter for containment operations
 */
export interface ContainmentFilter<
  T,
  K extends ContainmentProperty<T>,
  V extends ContainmentItemType<T, K>
> {
  column: K
  op: ContainmentOp
  value: V
}

/**
 * Type guard for column filtering
 *
 * @param filter The object to check
 * @returns True if the filter is a {@link ColumnFilter}
 */
export function isColumnFilter<T>(
  filter: unknown
): filter is ColumnFilter<T, keyof T> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "column" in filter &&
    "value" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(FilterOp).includes(filter.op as FilterOp)
  )
}

export function isContainmentFilter<T>(
  filter: unknown
): filter is ContainmentFilter<
  T,
  ContainmentProperty<T>,
  ContainmentItemType<T, ContainmentProperty<T>>
> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "column" in filter &&
    "value" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(ContainmentOp).includes(filter.op as ContainmentOp)
  )
}

/**
 *
 */
export interface NullColumnFilter<T, K extends keyof OptionalProperties<T>> {
  column: K
}

/**
 * Map of valid filter types for grouping
 */
type FilterTypes<T> =
  | ColumnFilter<T, keyof T>
  | NullColumnFilter<T, keyof OptionalProperties<T>>
  | ContainmentFilter<
      T,
      ContainmentProperty<T>,
      ContainmentItemType<T, ContainmentProperty<T>>
    >

/**
 * Represents a group of filters
 */
export interface FilterGroup<T> {
  filters: FilterTypes<T>[]
  op: BooleanOp
}

/**
 * Type guard for {@link FilterGroup}
 *
 * @param filter The filter to inspect
 * @returns True if the filter is a {@link FilterGroup}
 */
export function isFilterGroup<T>(filter: unknown): filter is FilterGroup<T> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "filters" in filter &&
    "op" in filter
  )
}

/**
 * Represents a where clause
 */
export interface WhereClause<T>
  extends RelationalQueryNode<RelationalNodeTypes.WHERE> {
  filter: FilterGroup<T> | FilterTypes<T>
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isWhereClause<T>(node: QueryNode): node is WhereClause<T> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeTypes.WHERE
  )
}

export interface ColumnAlias<T, K extends keyof T, N extends string> {
  column: K
  alias: N
}

export type AliasedType<T, K extends keyof T, N extends string> = Omit<T, K> &
  Record<N, T[K]>

/**
 * Rename to match nomenclature
 */
export interface SelectClause<T, K extends keyof T, R>
  extends QuerySource<R>,
    RelationalQueryNode<RelationalNodeTypes.SELECT> {
  columns: K[]
  alias?: ColumnAlias<T, K, string>
}

/**
 * Type guard for {@link SelectClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link SelectClause}
 */
export function isSelectClause<T, K extends keyof T, R = Pick<T, K>>(
  node: QueryNode
): node is SelectClause<T, K, R> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeTypes.SELECT
  )
}

/**
 * Represents a query against a table
 */
export interface TableQueryNode<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R
> extends RelationalQueryNode<RelationalNodeTypes.TABLE> {
  table: T
  select?: SelectClause<D["tables"][T], keyof D["tables"][T], R>
  where?: WhereClause<D["tables"][T]>
}

/**
 * Type guard for {@link TableQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link TableQueryNode}
 */
export function isTableQueryNode<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R
>(node: QueryNode): node is TableQueryNode<D, T, R> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeTypes.TABLE
  )
}
