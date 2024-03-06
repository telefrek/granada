/**
 * Extensions to the base query AST specific for relational data sources
 */

import type { OptionalProperties } from "@telefrek/core/type/utils"
import type { RelationalDataStore } from "."
import type { QueryNode, QuerySource } from "../query/ast"

/**
 * The supported types a {@link RelationalQueryNode} can have
 */
export enum RelationalNodeType {
  TABLE = "table",
  WHERE = "where",
  SELECT = "select",
}

/**
 * Represents an internal {@link QueryNode} use for building relational queries
 */
export interface RelationalQueryNode<NodeType extends RelationalNodeType>
  extends QueryNode {
  nodeType: NodeType
}

/**
 * Type guard for {@link RelationalQueryNode}
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link RelationalQueryNode}
 */
export function isRelationalQueryNode(
  node: QueryNode
): node is RelationalQueryNode<RelationalNodeType> {
  return typeof node === "object" && node !== null && "nodeType" in node
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
 * Represents a filter on a given column like:`table.column {op} value`
 */
export interface ColumnFilter<TableType, Column extends keyof TableType> {
  column: Column
  op: ColumnFilteringOperation
  value: TableType[Column]
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

/**
 * Special filter for containment operations
 */
export interface ContainmentFilter<
  TableType,
  Column extends ContainmentProperty<TableType>,
  ColumnItemType extends ContainmentItemType<TableType, Column>
> {
  column: Column
  op: ColumnValueContainsOperation
  value: ColumnItemType
}

/**
 * Type guard for column filtering via {@link ColumnFilteringOperation}
 *
 * @param filter The {@link FilterTypes} to check
 * @returns True if the filter is a {@link ColumnFilter}
 */
export function isColumnFilter<TableType>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>
): filter is ColumnFilter<TableType, keyof TableType> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "column" in filter &&
    "value" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(ColumnFilteringOperation).includes(
      filter.op as ColumnFilteringOperation
    )
  )
}

/**
 * Type guard for column filtering via {@link ColumnValueContainsOperation}
 *
 * @param filter The {@link FilterTypes} to check
 * @returns True if the filter is a {@link ContainmentFilter}
 */
export function isContainmentFilter<TableType>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>
): filter is ContainmentFilter<
  TableType,
  ContainmentProperty<TableType>,
  ContainmentItemType<TableType, ContainmentProperty<TableType>>
> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "column" in filter &&
    "value" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(ColumnValueContainsOperation).includes(
      filter.op as ColumnValueContainsOperation
    )
  )
}

/**
 * Filter for columns that are nullable
 */
export interface NullColumnFilter<
  TableType,
  Column extends keyof OptionalProperties<TableType>
> {
  column: Column
}

/**
 * Map of valid filter types for grouping
 */
type FilterTypes<TableType> =
  | ColumnFilter<TableType, keyof TableType>
  | NullColumnFilter<TableType, keyof OptionalProperties<TableType>>
  | ContainmentFilter<
      TableType,
      ContainmentProperty<TableType>,
      ContainmentItemType<TableType, ContainmentProperty<TableType>>
    >

/**
 * Represents a group of filters that are bound by a {@link BooleanOperation}
 */
export interface FilterGroup<TableType> {
  filters: FilterTypes<TableType>[]
  op: BooleanOperation
}

/**
 * Type guard for {@link FilterGroup}
 *
 * @param filter The filter to inspect
 * @returns True if the filter is a {@link FilterGroup}
 */
export function isFilterGroup<TableType>(
  filter: unknown
): filter is FilterGroup<TableType> {
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
export interface WhereClause<TableType>
  extends RelationalQueryNode<RelationalNodeType.WHERE> {
  filter: FilterGroup<TableType> | FilterTypes<TableType>
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isWhereClause<TableType>(
  node: QueryNode
): node is WhereClause<TableType> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.WHERE
  )
}

export interface ColumnAlias<T, K extends keyof T, N extends string> {
  column: K
  alias: N
}

/**
 * Rename to match nomenclature
 */
export interface SelectClause<T, K extends keyof T, R>
  extends QuerySource<R>,
    RelationalQueryNode<RelationalNodeType.SELECT> {
  columns: K[]
  alias?: ColumnAlias<T, K, string>[]
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
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.SELECT
  )
}

/**
 * Represents a query against a table
 */
export interface TableQueryNode<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R
> extends RelationalQueryNode<RelationalNodeType.TABLE> {
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
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.TABLE
  )
}
