/**
 * Extensions to the base query AST specific for sql data sources
 */

import type { SQLDataStore, STAR } from "."
import type { QueryNode } from "../"

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
 * Custom type to map records of {@link SQLDataStore} keys
 */
export type TableAlias = Record<
  keyof SQLDataStore["tables"],
  keyof SQLDataStore["tables"]
>

/**
 * The supported types a {@link SQLQueryNode} can have
 */
export enum SQLNodeType {
  TABLE = "table",
  WHERE = "where",
  CTE = "cte",
  JOIN = "join",
  ON = "on",
  ALIAS = "alias",
  PARAMETER = "parameter",
  RETURNING = "returning",
  SELECT = "select",
  INSERT = "insert",
  UPDATE = "update",
  MERGE = "merge",
  DELETE = "delete",
}

/**
 * Represents an internal {@link QueryNode} use for building sql queries
 */
export type SQLQueryNode<NodeType extends SQLNodeType> = QueryNode & {
  nodeType: NodeType
}

type ParameterFilter = {
  source: "parameter"
  value: ParameterNode
}

type ValueFilter = {
  source: "value"
  value: unknown
}

type NullFilter = {
  source: "null"
}

/**
 * Represents a filter on a given column like:`table.column {op} value`
 */
export type ColumnFilter = {
  column: string
  op: ColumnFilteringOperation
} & (ParameterFilter | ValueFilter | NullFilter)

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
export type ContainmentFilter<ContainmentObjectType> = {
  type: ContainmentObjectType
}

/**
 * A containment filter specific to array operations
 */
export type ArrayFilter = ContainmentFilter<ContainmentObjectType.ARRAY> & {
  column: string
  op: ColumnValueContainsOperation.IN
} & (ParameterFilter | ValueFilter)

/**
 * A containment filter specific to string objects
 */
export type StringFilter = ContainmentFilter<ContainmentObjectType.STRING> & {
  column: string
  op: ColumnValueContainsOperation
} & (ParameterFilter | ValueFilter)

/**
 * Map of valid filter types for grouping
 */
export type FilterTypes = ColumnFilter | ArrayFilter | StringFilter

/**
 * Represents a group of filters that are bound by a {@link BooleanOperation}
 */
export interface FilterGroup {
  filters: (FilterTypes | FilterGroup)[]
  op: BooleanOperation
}

/**
 * A type of {@link SQLQueryNode} that produces rows with a named table (either alias or existing)
 */
export interface NamedSQLQueryNode extends SQLQueryNode<SQLNodeType> {
  tableName: string
}

type ReturningClause = {
  returning?: string[] | STAR
}

type FilteredClause = {
  filter: FilterGroup | FilterTypes
}

export type SetClause = {
  column: string
} & (ParameterFilter | ValueFilter | NullFilter)

export type InsertClause = SQLQueryNode<SQLNodeType.INSERT> &
  NamedSQLQueryNode &
  ReturningClause & {
    columns?: string[]
  }

export type UpdateClause = SQLQueryNode<SQLNodeType.UPDATE> &
  NamedSQLQueryNode &
  ReturningClause &
  FilteredClause & {
    setColumns: SetClause[]
  }

export type MergeClause = SQLQueryNode<SQLNodeType.MERGE> &
  NamedSQLQueryNode &
  ReturningClause &
  FilteredClause

export type DeleteClause = SQLQueryNode<SQLNodeType.DELETE> &
  NamedSQLQueryNode &
  ReturningClause &
  FilteredClause

/**
 * A {@link SQLQueryNode} that represents a common table expression
 */
export type CteClause = SQLQueryNode<SQLNodeType.CTE> &
  NamedSQLQueryNode & {
    source: SQLQueryNode<SQLNodeType>
  }

/**
 * A {@link SQLQueryNode} that indicates a table query
 */
export type TableQueryNode = SQLQueryNode<SQLNodeType.TABLE> &
  NamedSQLQueryNode & {
    alias?: string
  }

/**
 * A {@link SQLQueryNode} that indicates a select clause
 */
export type SelectClause = SQLQueryNode<SQLNodeType.SELECT> & {
  columns: string[] | STAR
}

/**
 * An alias for a column in a {@link SelectClause}
 */
export type ColumnAlias = SQLQueryNode<SQLNodeType.ALIAS> & {
  column: string
  alias: string
}

/**
 * Represents a where clause
 */
export type WhereClause = SQLQueryNode<SQLNodeType.WHERE> & FilteredClause

/**
 * A type of {@link SQLQueryNode} that represents a join operation
 */
export type JoinQueryNode = SQLQueryNode<SQLNodeType.JOIN>

/**
 * A type of {@link SQLQueryNode} that represents a join clause
 */
export type JoinClauseQueryNode = SQLQueryNode<SQLNodeType.ON> & {
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
 * A type of {@link SQLQueryNode} that indicates a parameter reference
 */
export type ParameterNode = SQLQueryNode<SQLNodeType.PARAMETER> & {
  name: string
}

/**
 * Type guard for {@link SQLQueryNode}
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link SQLQueryNode}
 */
export function isSQLQueryNode(
  node: unknown,
): node is SQLQueryNode<SQLNodeType> {
  return (
    typeof node === "object" &&
    node !== null &&
    "nodeType" in node &&
    Object.values(SQLNodeType).includes(node.nodeType as SQLNodeType)
  )
}
/**
 * Type guard for {@link ParameterNode} instances
 *
 * @param node The {@link Querynode} to check
 * @returns True if the node is a {@link ParameterNode}
 */
export function isParameterNode(node: unknown): node is ParameterNode {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.PARAMETER
}

/**
 * Type guard for {@link FilterGroup}
 *
 * @param filter The filter to inspect
 * @returns True if the filter is a {@link FilterGroup}
 */
export function isFilterGroup(
  filter: FilterTypes | FilterGroup,
): filter is FilterGroup {
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
export function isColumnFilter(
  filter: FilterTypes | FilterGroup,
): filter is ColumnFilter {
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
export function IsArrayFilter(
  filter: FilterTypes | FilterGroup,
): filter is ArrayFilter {
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
export function isStringFilter(
  filter: FilterTypes | FilterGroup,
): filter is StringFilter {
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
 * Type guard for {@link SQLQueryNode} that generate rows
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the object is a {@link SQLQueryNode} that generated rows
 */
export function isGenerator(
  node: QueryNode,
): node is SQLQueryNode<SQLNodeType> {
  return (
    isSQLQueryNode(node) &&
    (node.nodeType === SQLNodeType.TABLE ||
      node.nodeType === SQLNodeType.JOIN ||
      node.nodeType === SQLNodeType.CTE ||
      node.nodeType === SQLNodeType.ALIAS)
  )
}

/**
 * Type guard for {@link NamedSQLQueryNode} objects
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link NamedSQLQueryNode}
 */
export function isNamedSQLQueryNode(
  node: QueryNode,
): node is NamedSQLQueryNode {
  return "tableName" in node && typeof node.tableName === "string"
}

/**
 * Type guard for {@link CteClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link CteClause}
 */
export function isCteClause(node: QueryNode): node is CteClause {
  return (
    isSQLQueryNode(node) &&
    node.nodeType === SQLNodeType.CTE &&
    isNamedSQLQueryNode(node)
  )
}

/**
 * Type guard for {@link InsertClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link InsertClause}
 */
export function isInsertClause(node: QueryNode): node is InsertClause {
  return (
    isSQLQueryNode(node) &&
    node.nodeType === SQLNodeType.INSERT &&
    isNamedSQLQueryNode(node)
  )
}

/**
 * Type guard for {@link UpdateClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link UpdateClause}
 */
export function isUpdateClause(node: QueryNode): node is UpdateClause {
  return (
    isSQLQueryNode(node) &&
    node.nodeType === SQLNodeType.UPDATE &&
    isNamedSQLQueryNode(node)
  )
}

/**
 * Type guard for {@link MergeClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link MergeClause}
 */
export function isMergeClause(node: QueryNode): node is MergeClause {
  return (
    isSQLQueryNode(node) &&
    node.nodeType === SQLNodeType.MERGE &&
    isNamedSQLQueryNode(node)
  )
}

/**
 * Type guard for {@link DeleteClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link DeleteClause}
 */
export function isDeleteClause(node: QueryNode): node is DeleteClause {
  return (
    isSQLQueryNode(node) &&
    node.nodeType === SQLNodeType.DELETE &&
    isNamedSQLQueryNode(node)
  )
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isWhereClause(node: QueryNode): node is WhereClause {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.WHERE
}

/**
 * Type guard for {@link SelectClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link SelectClause}
 */
export function isSelectClause(node: QueryNode): node is SelectClause {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.SELECT
}

/**
 * Type guard for {@link ColumnAlias} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link ColumnAlias}
 */
export function isColumnAlias(node: QueryNode): node is ColumnAlias {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.ALIAS
}

/**
 * Type guard for {@link TableQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link TableQueryNode}
 */
export function isTableQueryNode(node: QueryNode): node is TableQueryNode {
  return (
    isSQLQueryNode(node) &&
    node.nodeType === SQLNodeType.TABLE &&
    isNamedSQLQueryNode(node)
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
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.JOIN
}

/**
 * Type guard for {@link JoinClauseQueryNode} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link JoinClauseQueryNode}
 */
export function isJoinClauseNode(node: QueryNode): node is JoinClauseQueryNode {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.ON
}

/**
 * Verify if the value is not undefined and one of the correct types
 *
 * @param filter The {@link FilterGroup} or {@link FilterTypes}
 * @returns True if it is a valid {@link FilterGroup} or {@link FilterTypes}
 */
export function isFilter(
  filter?: FilterGroup | FilterTypes,
): filter is FilterGroup | FilterTypes {
  return filter !== undefined
}
