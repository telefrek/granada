import type { QueryNode } from "../../index"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ContainmentObjectType,
  type ArrayFilter,
  type ColumnFilter,
  type FilterGroup,
  type FilterTypes,
  type JoinColumnFilter,
  type StringFilter,
} from "./filtering"
import {
  SQLNodeType,
  type ColumnAliasClause,
  type CteClause,
  type DeleteClause,
  type InsertClause,
  type JoinClauseQueryNode,
  type JoinQueryNode,
  type MergeClause,
  type ParameterClause,
  type ReturningClause,
  type SQLQueryNode,
  type SelectClause,
  type TableSQLQueryNode,
  type UpdateClause,
  type WhereClause,
} from "./index"

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
 * Type guard for {@link ParameterClause} instances
 *
 * @param node The {@link Querynode} to check
 * @returns True if the node is a {@link ParameterClause}
 */
export function isParameterNode(node: unknown): node is ParameterClause {
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
    "columnType" in filter &&
    filter.columnType === ContainmentObjectType.ARRAY
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
    "columnType" in filter &&
    filter.columnType === ContainmentObjectType.STRING
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
    (node.nodeType === SQLNodeType.SELECT ||
      node.nodeType === SQLNodeType.JOIN ||
      node.nodeType === SQLNodeType.CTE ||
      node.nodeType === SQLNodeType.ALIAS)
  )
}

/**
 * Type guard for {@link TableSQLQueryNode} objects
 *
 * @param node The {@link QueryNode} to check
 * @returns True if the node is a {@link TableSQLQueryNode}
 */
export function isNamedSQLQueryNode(
  node: QueryNode,
): node is TableSQLQueryNode<SQLNodeType> {
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
 * Type guard for {@link ColumnAliasClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link ColumnAliasClause}
 */
export function isColumnAliasClause(
  node: QueryNode,
): node is ColumnAliasClause {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.ALIAS
}

export function isReturningClause(node: QueryNode): node is ReturningClause {
  return isSQLQueryNode(node) && node.nodeType === SQLNodeType.RETURNING
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
