/**
 * Extensions to the base query AST specific for relational data sources
 */

import type { OptionalProperties } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable, STAR } from "."
import type { QueryNode } from "../query/ast"
import {
  type ArrayItemType,
  type ArrayProperty,
  type PropertyOfType,
} from "./types"

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
 * Represents different types of column ifltring operations
 */
export enum ColumnFilteringOperation {
  EQ = "=",
  LT = "<",
  GT = ">",
  LTE = "<=",
  GTE = ">=",
}

/**
 * Represents differernt type of column containment operations
 */
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
 * Custom type to map records of RelationalDataStore keys
 */
export type TableAlias = Record<
  keyof RelationalDataStore["tables"],
  keyof RelationalDataStore["tables"]
>

/**
 * A provider that returns relational query nodes
 */
export interface RelationalNodeProvider<
  NodeType extends
    RelationalQueryNode<RelationalNodeType> = RelationalQueryNode<RelationalNodeType>,
> {
  asNode(): NodeType
}

/**
 * The supported types a {@link RelationalQueryNode} can have
 */
export enum RelationalNodeType {
  TABLE = "table",
  WHERE = "where",
  CTE = "cte",
  JOIN = "join",
  ON = "on",
  ALIAS = "alias",
  PARAMETER = "parameter",
  SELECT = "select",
  INSERT = "insert",
  UPDATE = "update",
  MERGE = "merge",
  DELETE = "delete",
}

/**
 * Represents an internal {@link QueryNode} use for building relational queries
 */
export type RelationalQueryNode<NodeType extends RelationalNodeType> =
  QueryNode & {
    nodeType: NodeType
  }

/**
 * Represents a filter on a given column like:`table.column {op} value`
 */
export interface ColumnFilter<
  TableType extends RelationalDataTable,
  Column extends keyof TableType,
> {
  column: Column
  op: ColumnFilteringOperation
  value: TableType[Column] | ParameterNode
}

/**
 * The type of containment object being examined (strings and arrays are different)
 */
export enum ContainmentObjectType {
  ARRAY,
  STRING,
}

/**
 * Defines a simple containment filter with the type of object the containment references
 */
export interface ContainmentFilter<ContainmentObjectType> {
  type: ContainmentObjectType
}

/**
 * A containment filter specific to array operations
 */
export type ArrayFilter<
  TableType extends RelationalDataTable,
  Column extends ArrayProperty<TableType>,
  ColumnItemType extends ArrayItemType<TableType, Column>,
> = ContainmentFilter<ContainmentObjectType.ARRAY> & {
  column: Column
  op: ColumnValueContainsOperation.IN
  value: ColumnItemType | ColumnItemType[] | ParameterNode
}

/**
 * A containment filter specific to string objects
 */
export type StringFilter<
  TableType extends RelationalDataTable,
  Column extends PropertyOfType<TableType, string>,
> = ContainmentFilter<ContainmentObjectType.STRING> & {
  column: Column
  op: ColumnValueContainsOperation
  value: string | ParameterNode
}

/**
 * Filter for columns that are nullable
 */
export interface NullColumnFilter<
  TableType extends RelationalDataTable,
  Column extends keyof OptionalProperties<TableType>,
> {
  column: Column
}

/**
 * Map of valid filter types for grouping
 */
export type FilterTypes<TableType extends RelationalDataTable> =
  | ColumnFilter<TableType, keyof TableType>
  | NullColumnFilter<TableType, keyof OptionalProperties<TableType>>
  | ArrayFilter<
      TableType,
      ArrayProperty<TableType>,
      ArrayItemType<TableType, ArrayProperty<TableType>>
    >
  | StringFilter<TableType, PropertyOfType<TableType, string>>

/**
 * Represents a group of filters that are bound by a {@link BooleanOperation}
 */
export interface FilterGroup<TableType extends RelationalDataTable> {
  filters: (FilterTypes<TableType> | FilterGroup<TableType>)[]
  op: BooleanOperation
}

/**
 * A type of {@link RelationalQueryNode} that produces rows with a named table (either alias or existing)
 */
export interface NamedRowGenerator
  extends RelationalQueryNode<RelationalNodeType> {
  tableName: string
}

/**
 * A {@link RelationalQueryNode} that represents a common table expression
 */
export type CteClause = RelationalQueryNode<RelationalNodeType.CTE> &
  NamedRowGenerator & {
    source: RelationalQueryNode<RelationalNodeType>
  }

/**
 * A {@link RelationalQueryNode} that indicates a table query
 */
export type TableQueryNode = RelationalQueryNode<RelationalNodeType.TABLE> &
  NamedRowGenerator & {
    alias?: string
  }

/**
 * A {@link RelationalQueryNode} that indicates a select clause
 */
export type SelectClause = RelationalQueryNode<RelationalNodeType.SELECT> & {
  columns: string[] | STAR
}

/**
 * An alias for a column in a {@link SelectClause}
 */
export type ColumnAlias<
  TableType extends RelationalDataTable,
  Column extends keyof TableType & string,
> = RelationalQueryNode<RelationalNodeType.ALIAS> & {
  column: Column
  alias: string
}

/**
 * Represents a where clause
 */
export type WhereClause<TableType extends RelationalDataTable> =
  RelationalQueryNode<RelationalNodeType.WHERE> & {
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  }

/**
 * A type of {@link RelationalQueryNode} that represents a join operation
 */
export type JoinQueryNode = RelationalQueryNode<RelationalNodeType.JOIN>

/**
 * A type of {@link RelationalQueryNode} that represents a join clause
 */
export type JoinClauseQueryNode = RelationalQueryNode<RelationalNodeType.ON> & {
  left: string
  right: string
  filter: JoinColumnFilter
  type: JoinType
}

/**
 * A filter on a {@link JoinClauseQueryNode}
 */
export interface JoinColumnFilter {
  leftColumn: string
  rightColumn: string
  op: ColumnFilteringOperation
}

/**
 * A type of {@link RelationalQueryNode} that indicates a parameter reference
 */
export type ParameterNode =
  RelationalQueryNode<RelationalNodeType.PARAMETER> & {
    name: string
  }

/**
 * Type guard for {@link RelationalQueryNode}
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link RelationalQueryNode}
 */
export function isRelationalQueryNode(
  node: unknown,
): node is RelationalQueryNode<RelationalNodeType> {
  return (
    typeof node === "object" &&
    node !== null &&
    "nodeType" in node &&
    Object.values(RelationalNodeType).includes(
      node.nodeType as RelationalNodeType,
    )
  )
}

/**
 * Type guard for {@link ParameterNode} instances
 *
 * @param node The {@link Querynode} to check
 * @returns True if the node is a {@link ParameterNode}
 */
export function isParameterNode(node: unknown): node is ParameterNode {
  return (
    isRelationalQueryNode(node) &&
    node.nodeType === RelationalNodeType.PARAMETER
  )
}

/**
 * Type guard for {@link FilterGroup}
 *
 * @param filter The filter to inspect
 * @returns True if the filter is a {@link FilterGroup}
 */
export function isFilterGroup<TableType extends RelationalDataTable>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>,
): filter is FilterGroup<TableType> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "filters" in filter &&
    Array.isArray(filter.filters) &&
    typeof filter.op === "string" &&
    Object.values(BooleanOperation).includes(filter.op)
  )
}

/**
 * Type guard for column filtering via {@link ColumnFilteringOperation}
 *
 * @param filter The {@link FilterTypes} to check
 * @returns True if the filter is a {@link ColumnFilter}
 */
export function isColumnFilter<TableType extends RelationalDataTable>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>,
): filter is ColumnFilter<TableType, keyof TableType> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "column" in filter &&
    "value" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(ColumnFilteringOperation).includes(
      filter.op as ColumnFilteringOperation,
    )
  )
}

/**
 * Type guard for column filtering via {@link ColumnValueContainsOperation}
 *
 * @param filter The {@link FilterTypes} to check
 * @returns True if the filter is a {@link ArrayFilter}
 */
export function IsArrayFilter<TableType extends RelationalDataTable>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>,
): filter is ArrayFilter<
  TableType,
  ArrayProperty<TableType>,
  ArrayItemType<TableType, ArrayProperty<TableType>>
> {
  return (
    typeof filter === "object" &&
      filter !== null &&
      "column" in filter &&
      "value" in filter &&
      "type" in filter &&
      filter.type === ContainmentObjectType.ARRAY,
    "op" in filter &&
      typeof filter.op === "string" &&
      Object.values(ColumnValueContainsOperation).includes(
        filter.op as ColumnValueContainsOperation,
      )
  )
}

/**
 * Type guard for column filtering via {@link ColumnValueContainsOperation}
 *
 * @param filter The {@link FilterTypes} to check
 * @returns True if the filter is a {@link StringFilter}
 */
export function isStringFilter<TableType extends RelationalDataTable>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>,
): filter is StringFilter<TableType, PropertyOfType<TableType, string>> {
  return (
    typeof filter === "object" &&
      filter !== null &&
      "column" in filter &&
      "value" in filter &&
      "type" in filter &&
      filter.type === ContainmentObjectType.STRING,
    "op" in filter &&
      typeof filter.op === "string" &&
      Object.values(ColumnValueContainsOperation).includes(
        filter.op as ColumnValueContainsOperation,
      )
  )
}

/**
 * Type guard for {@link RelationalQueryNode} that generate rows
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the object is a {@link RelationalQueryNode} that generated rows
 */
export function isGenerator(
  node: QueryNode,
): node is RelationalQueryNode<RelationalNodeType> {
  return (
    isRelationalQueryNode(node) &&
    (node.nodeType === RelationalNodeType.TABLE ||
      node.nodeType === RelationalNodeType.JOIN ||
      node.nodeType === RelationalNodeType.CTE ||
      node.nodeType === RelationalNodeType.ALIAS)
  )
}

/**
 * Type guard for {@link NamedRowGenerator} objects
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link NamedRowGenerator}
 */
export function isNamedGenerator(node: QueryNode): node is NamedRowGenerator {
  return (
    isGenerator(node) &&
    "tableName" in node &&
    typeof node.tableName === "string"
  )
}

/**
 * Type guard for {@link CteClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link CteClause}
 */
export function isCteClause(node: QueryNode): node is CteClause {
  return isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.CTE
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isWhereClause(
  node: QueryNode,
): node is WhereClause<RelationalDataTable> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.WHERE
  )
}

/**
 * Type guard for {@link SelectClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link SelectClause}
 */
export function isSelectClause(node: QueryNode): node is SelectClause {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.SELECT
  )
}

/**
 * Type guard for {@link ColumnAlias} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link ColumnAlias}
 */
export function isColumnAlias(
  node: QueryNode,
): node is ColumnAlias<RelationalDataTable, keyof RelationalDataTable> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.ALIAS
  )
}

/**
 * Type guard for {@link TableQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link TableQueryNode}
 */
export function isTableQueryNode(node: QueryNode): node is TableQueryNode {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.TABLE
  )
}

/**
 * Type guard for {@link JoinColumnFilter} identification
 *
 * @param filter The unknown object to check
 * @returns True if the filter is a {@link JoinColumnFilter}
 */
export function isJoinColumnFilter(
  filter: unknown,
): filter is JoinColumnFilter {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "leftColumn" in filter &&
    "rightColumn" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(ColumnFilteringOperation).includes(
      filter.op as ColumnFilteringOperation,
    )
  )
}

/**
 * Type guard for {@link JoinQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link JoinQueryNode}
 */
export function isJoinQueryNode(node: QueryNode): node is JoinQueryNode {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.JOIN
  )
}

/**
 * Type guard for {@link JoinClauseQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link JoinClauseQueryNode}
 */
export function isJoinClauseNode(node: QueryNode): node is JoinClauseQueryNode {
  return isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.ON
}

/**
 * Verify if the value is not undefined and one of the correct types
 *
 * @param filter The {@link FilterGroup} or {@link FilterTypes}
 * @returns True if it is a valid {@link FilterGroup} or {@link FilterTypes}
 */
export function isFilter<T extends RelationalDataTable>(
  filter?: FilterGroup<T> | FilterTypes<T>,
): filter is FilterGroup<T> | FilterTypes<T> {
  return filter !== undefined
}
