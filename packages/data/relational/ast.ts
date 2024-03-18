/**
 * Extensions to the base query AST specific for relational data sources
 */

import type { OptionalProperties } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable, STAR } from "."
import type { QueryNode, QuerySource } from "../query/ast"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
  type JoinType,
  type MatchingProperty,
  type PropertiesOfType,
} from "./types"

/**
 * Represents an internal {@link QueryNode} use for building relational queries
 */
export type RelationalQueryNode<NodeType extends RelationalNodeType> =
  QueryNode & {
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
  return (
    typeof node === "object" &&
    node !== null &&
    "nodeType" in node &&
    Object.values(RelationalNodeType).includes(
      node.nodeType as RelationalNodeType
    )
  )
}

/**
 * Represents a filter on a given column like:`table.column {op} value`
 */
export type ColumnFilter<
  TableType extends RelationalDataTable,
  Column extends keyof TableType
> = {
  column: Column
  op: ColumnFilteringOperation
  value: TableType[Column]
}

export enum ContainmentObjectType {
  ARRAY,
  STRING,
}

export type ContainmentFilter<ContainmentObjectType> = {
  type: ContainmentObjectType
}

/**
 * Special filter for containment operations
 */
export type ArrayFilter<
  TableType extends RelationalDataTable,
  Column extends ArrayProperty<TableType>,
  ColumnItemType extends ArrayItemType<TableType, Column>
> = ContainmentFilter<ContainmentObjectType.ARRAY> & {
  column: Column
  op: ColumnValueContainsOperation.IN
  value: ColumnItemType | ColumnItemType[]
}

export type StringFilter<
  TableType extends RelationalDataTable,
  Column extends PropertiesOfType<TableType, string>
> = ContainmentFilter<ContainmentObjectType.STRING> & {
  column: Column
  op: ColumnValueContainsOperation
  value: string
}

/**
 * Type guard for column filtering via {@link ColumnFilteringOperation}
 *
 * @param filter The {@link FilterTypes} to check
 * @returns True if the filter is a {@link ColumnFilter}
 */
export function isColumnFilter<TableType extends RelationalDataTable>(
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
 * @returns True if the filter is a {@link ArrayFilter}
 */
export function IsArrayFilter<TableType extends RelationalDataTable>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>
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
        filter.op as ColumnValueContainsOperation
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
  filter: FilterTypes<TableType> | FilterGroup<TableType>
): filter is StringFilter<TableType, PropertiesOfType<TableType, string>> {
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
        filter.op as ColumnValueContainsOperation
      )
  )
}

/**
 * Filter for columns that are nullable
 */
export type NullColumnFilter<
  TableType extends RelationalDataTable,
  Column extends keyof OptionalProperties<TableType>
> = {
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
  | StringFilter<TableType, PropertiesOfType<TableType, string>>

/**
 * Represents a group of filters that are bound by a {@link BooleanOperation}
 */
export type FilterGroup<TableType extends RelationalDataTable> = {
  filters: (FilterTypes<TableType> | FilterGroup<TableType>)[]
  op: BooleanOperation
}

/**
 * Type guard for {@link FilterGroup}
 *
 * @param filter The filter to inspect
 * @returns True if the filter is a {@link FilterGroup}
 */
export function isFilterGroup<TableType extends RelationalDataTable>(
  filter: FilterTypes<TableType> | FilterGroup<TableType>
): filter is FilterGroup<TableType> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "filters" in filter &&
    Array.isArray(filter.filters) &&
    typeof filter.op === "string" &&
    Object.values(BooleanOperation).includes(filter.op as BooleanOperation)
  )
}

export type RowGenerator<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable
> = RelationalQueryNode<RelationalNodeType>

export function isGenerator(
  node: QueryNode
): node is RowGenerator<RelationalDataStore, RelationalDataTable> {
  return (
    isRelationalQueryNode(node) &&
    (node.nodeType === RelationalNodeType.TABLE ||
      node.nodeType === RelationalNodeType.JOIN ||
      node.nodeType === RelationalNodeType.CTE ||
      node.nodeType === RelationalNodeType.ALIAS)
  )
}

export type NamedRowGenerator<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable
> = RowGenerator<DataStoreType, RowType> & {
  tableName: TableName
}

/**
 * Defines a CTE clause
 */
export type CteClause<
  DataStoreType extends RelationalDataStore,
  Alias extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable
> = NamedRowGenerator<DataStoreType, Alias, RowType> &
  RelationalQueryNode<RelationalNodeType.CTE> & {
    source: RowGenerator<DataStoreType, RowType>
  }

/**
 * Represents a query against a table
 */
export type TableQueryNode<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName]
> = RelationalQueryNode<RelationalNodeType.TABLE> &
  NamedRowGenerator<DataStoreType, TableName, RowType> & {
    tableName: TableName
    alias?: keyof DataStoreType["tables"]
  }

/**
 * Rename to match nomenclature
 */
export type SelectClause<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  Column extends keyof DataStoreType["tables"][TableName] = keyof DataStoreType["tables"][TableName],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName]
> = QuerySource<RowType> &
  RelationalQueryNode<RelationalNodeType.SELECT> & {
    columns: Column[] | STAR
  }

/**
 * Reipresents a column alias value
 */
export type ColumnAlias<
  TableType extends RelationalDataTable,
  Column extends keyof TableType,
  Alias extends string
> = RelationalQueryNode<RelationalNodeType.ALIAS> & {
  column: Column
  alias: Alias
}

/**
 * Represents a where clause
 */
export type WhereClause<TableType extends RelationalDataTable> =
  RelationalQueryNode<RelationalNodeType.WHERE> & {
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  }

export type JoinColumnFilter<
  LeftTable extends RelationalDataTable,
  RightTable extends RelationalDataTable,
  LeftColumn extends keyof LeftTable = keyof LeftTable,
  RightColumn extends MatchingProperty<
    LeftTable,
    RightTable,
    LeftColumn
  > = MatchingProperty<LeftTable, RightTable, LeftColumn>
> = {
  leftColumn: LeftColumn
  rightColumn: RightColumn
  op: ColumnFilteringOperation
}

export type JoinQueryNode<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable
> = RelationalQueryNode<RelationalNodeType.JOIN> &
  RowGenerator<DataStoreType, RowType>

export type JoinClauseQueryNode<
  DataStoreType extends RelationalDataStore,
  LeftTable extends keyof DataStoreType["tables"],
  RightTable extends keyof DataStoreType["tables"]
> = RelationalQueryNode<RelationalNodeType.ON> & {
  left: LeftTable
  right: RightTable
  filter: JoinColumnFilter<
    DataStoreType["tables"][LeftTable],
    DataStoreType["tables"][RightTable],
    keyof DataStoreType["tables"][LeftTable],
    MatchingProperty<
      DataStoreType["tables"][LeftTable],
      DataStoreType["tables"][RightTable],
      keyof DataStoreType["tables"][LeftTable]
    >
  >
  type: JoinType
}

export function isNamedGenerator<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"]
>(
  node: RelationalQueryNode<RelationalNodeType>
): node is NamedRowGenerator<DataStoreType, TableName, RelationalDataTable> {
  return (
    isGenerator(node) &&
    "tableName" in node &&
    typeof node.tableName === "string"
  )
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isCteClause<DataStoreType extends RelationalDataStore>(
  node: RelationalQueryNode<RelationalNodeType>
): node is CteClause<DataStoreType, string, RelationalDataTable> {
  return node.nodeType === RelationalNodeType.CTE
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link RelationalQueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isWhereClause(
  node: QueryNode
): node is WhereClause<RelationalDataTable> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.WHERE
  )
}

/**
 * Type guard for {@link SelectClause} identification
 *
 * @param node The {@link RelationalQueryNode} to inspect
 * @returns True if the node is a {@link SelectClause}
 */
export function isSelectClause(
  node: QueryNode
): node is SelectClause<
  RelationalDataStore,
  keyof RelationalDataStore["tables"]
> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.SELECT
  )
}

export function isColumnAlias(
  node: QueryNode
): node is ColumnAlias<RelationalDataTable, keyof RelationalDataTable, string> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.ALIAS
  )
}

/**
 * Type guard for {@link TableQueryNode} identification
 *
 * @param node The {@link RelationalQueryNode} to inspect
 * @returns True if the node is a {@link TableQueryNode}
 */
export function isTableQueryNode<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TargetTable]
>(
  node: QueryNode
): node is TableQueryNode<DataStoreType, TargetTable, RowType> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.TABLE
  )
}

export function isJoinColumnFilter(
  filter: unknown
): filter is JoinColumnFilter<RelationalDataTable, RelationalDataTable> {
  return (
    typeof filter === "object" &&
    filter !== null &&
    "leftColumn" in filter &&
    "rightColumn" in filter &&
    "op" in filter &&
    typeof filter.op === "string" &&
    Object.values(ColumnFilteringOperation).includes(
      filter.op as ColumnFilteringOperation
    )
  )
}

export function isJoinQueryNode(
  node: QueryNode
): node is JoinQueryNode<RelationalDataStore, RelationalDataTable> {
  return (
    isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.JOIN
  )
}

export function isJoinClauseNode<DataStoreType extends RelationalDataStore>(
  node: QueryNode
): node is JoinClauseQueryNode<
  DataStoreType,
  keyof DataStoreType["tables"],
  keyof DataStoreType["tables"]
> {
  return isRelationalQueryNode(node) && node.nodeType === RelationalNodeType.ON
}
