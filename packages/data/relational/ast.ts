/**
 * Extensions to the base query AST specific for relational data sources
 */

import type { OptionalProperties } from "@telefrek/core/type/utils"
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
function isRelationalQueryNode(
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
    "op" in filter &&
    "value" in filter
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
  where: FilterGroup<T> | FilterTypes<T>
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

/**
 * Rename to match nomenclature
 */
export interface SelectClause<T>
  extends QuerySource<T>,
    RelationalQueryNode<RelationalNodeTypes.SELECT> {}

/**
 * Type guard for {@link SelectClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link SelectClause}
 */
export function isSelectClause<T>(node: QueryNode): node is SelectClause<T> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeTypes.SELECT
  )
}

/**
 * Represents a query against a table
 */
export interface TableQueryNode<T>
  extends RelationalQueryNode<RelationalNodeTypes.TABLE> {
  select?: SelectClause<T>
  where?: WhereClause<T>
}

/**
 * Type guard for {@link TableQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link TableQueryNode}
 */
export function isTableQueryNode<T>(
  node: QueryNode
): node is TableQueryNode<T> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeTypes.TABLE
  )
}
