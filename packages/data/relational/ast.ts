/**
 * Extensions to the base query AST specific for relational data sources
 */

import type { OptionalProperties } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable } from "."
import type { QueryNode, QuerySource } from "../query/ast"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
  type JoinType,
  type MatchingKey,
  type MergedNonOverlappingType,
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
export type ColumnFilter<TableType, Column extends keyof TableType> = {
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
  TableType,
  Column extends ArrayProperty<TableType>,
  ColumnItemType extends ArrayItemType<TableType, Column>
> = ContainmentFilter<ContainmentObjectType.ARRAY> & {
  column: Column
  op: ColumnValueContainsOperation
  value: ColumnItemType | ColumnItemType[]
}

export type StringFilter<
  TableType,
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
 * @returns True if the filter is a {@link ArrayFilter}
 */
export function IsArrayFilter<TableType>(
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
export function isStringFilter<TableType>(
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
  TableType,
  Column extends keyof OptionalProperties<TableType>
> = {
  column: Column
}

/**
 * Map of valid filter types for grouping
 */
export type FilterTypes<TableType> =
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
export type FilterGroup<TableType> = {
  filters: (FilterTypes<TableType> | FilterGroup<TableType>)[]
  op: BooleanOperation
}

/**
 * Type guard for {@link FilterGroup}
 *
 * @param filter The filter to inspect
 * @returns True if the filter is a {@link FilterGroup}
 */
export function isFilterGroup<TableType>(
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

/**
 * Defines a CTE clause
 */
export type CteClause<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"]
> = RelationalQueryNode<RelationalNodeType.CTE> & {
  source: TableQueryNode<
    DataStoreType,
    TargetTable,
    DataStoreType["tables"][TargetTable]
  >
  tableName: TargetTable
}

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link QueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isCteClause<DataStoreType extends RelationalDataStore>(
  node: RelationalQueryNode<RelationalNodeType>
): node is CteClause<DataStoreType, keyof DataStoreType["tables"]> {
  return node.nodeType === RelationalNodeType.CTE
}

/**
 * Represents a where clause
 */
export type WhereClause<TableType> =
  RelationalQueryNode<RelationalNodeType.WHERE> & {
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  }

/**
 * Type guard for {@link WhereClause} identification
 *
 * @param node The {@link RelationalQueryNode} to inspect
 * @returns True if the node is a {@link WhereClause}
 */
export function isWhereClause<TableType>(
  node: RelationalQueryNode<RelationalNodeType>
): node is WhereClause<TableType> {
  return node.nodeType === RelationalNodeType.WHERE
}

/**
 * Reipresents a column alias value
 */
export type ColumnAlias<
  TableType extends RelationalDataTable,
  Column extends keyof TableType,
  Alias extends string
> = {
  column: Column
  alias: Alias
}

/**
 * Rename to match nomenclature
 */
export type SelectClause<
  TableType extends RelationalDataTable,
  Column extends keyof TableType,
  RowType extends RelationalDataTable
> = QuerySource<RowType> &
  RelationalQueryNode<RelationalNodeType.SELECT> & {
    columns: Column[]
    aliasing?: ColumnAlias<TableType, Column, string>[]
  }

/**
 * Type guard for {@link SelectClause} identification
 *
 * @param node The {@link RelationalQueryNode} to inspect
 * @returns True if the node is a {@link SelectClause}
 */
export function isSelectClause<
  TableType extends RelationalDataTable,
  Column extends keyof TableType,
  RowType extends RelationalDataTable = Pick<TableType, Column>
>(
  node: RelationalQueryNode<RelationalNodeType>
): node is SelectClause<TableType, Column, RowType> {
  return node.nodeType === RelationalNodeType.SELECT
}

/**
 * Represents a query against a table
 */
export type TableQueryNode<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
  TableAlias extends keyof DataStoreType["tables"] = never
> = RelationalQueryNode<RelationalNodeType.TABLE> & {
  tableName: TableName
  tableAlias?: TableAlias
  select?: SelectClause<
    DataStoreType["tables"][TableName],
    keyof DataStoreType["tables"][TableName],
    RowType
  >
  where?: WhereClause<DataStoreType["tables"][TableName]>
}

export type JoinQueryNode<
  DataStoreType extends RelationalDataStore,
  Left extends keyof DataStoreType["tables"],
  Right extends keyof DataStoreType["tables"],
  LeftColumn extends keyof DataStoreType["tables"][Left],
  RightColumn extends keyof MatchingKey<
    DataStoreType["tables"][Left],
    DataStoreType["tables"][Right],
    LeftColumn
  >,
  RowType extends MergedNonOverlappingType<
    DataStoreType["tables"][Left],
    DataStoreType["tables"][Right]
  > = MergedNonOverlappingType<
    DataStoreType["tables"][Left],
    DataStoreType["tables"][Right]
  >
> = QuerySource<RowType> &
  RelationalQueryNode<RelationalNodeType.JOIN> & {
    left: Left
    right: Right
    leftColumn: LeftColumn
    rightColumn: RightColumn
    joinType: JoinType
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
  TableType extends DataStoreType["tables"][TargetTable],
  RowType extends RelationalDataTable = TableType
>(
  node: RelationalQueryNode<RelationalNodeType>
): node is TableQueryNode<DataStoreType, TargetTable, RowType> {
  return node.nodeType === RelationalNodeType.TABLE
}
