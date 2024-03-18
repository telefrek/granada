/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils.js"
import type { RelationalDataStore, RelationalDataTable, STAR } from ".."
import {
  ParameterizedQueryBuilderBase,
  QueryBuilderBase,
} from "../../query/builder"
import type { ExecutionMode, Query } from "../../query/index"
import {
  ContainmentObjectType,
  type FilterGroup,
  type FilterTypes,
  type NamedRowGenerator,
  type RelationalQueryNode,
} from "../ast"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
  type JoinType,
  type MergedNonOverlappingType,
  type ModifiedStore,
  type PropertiesOfType,
} from "../types"
import { DefaultRelationalNodeBuilder } from "./internal"

/**
 * Use the given {@link DataStoreType} to build a query
 *
 * @returns A {@link RelationalNodeBuilder} for the given {@link DataStoreType}
 */
export function useDataStore<
  DataStoreType extends RelationalDataStore,
>(): RelationalNodeBuilder<DataStoreType> {
  return new DefaultRelationalNodeBuilder()
}

/**
 * Represents a {@link QueryBuilder} that is specifically for relational
 * database queries
 */
export abstract class RelationalQueryBuilder<
  T extends RelationalDataTable,
> extends QueryBuilderBase<T> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }
}

export abstract class ParameterizedRelationalQueryBuilder<
  T extends Record<string, unknown>,
  U extends RelationalDataTable,
> extends ParameterizedQueryBuilderBase<T, U> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }
}

/**
 * Represents a relational query that will return some value of {@link RowType}
 * from the given {@link DataStoreType}
 */
export interface RelationalRowProvider<
  RowType extends RelationalDataTable,
  NodeType extends
    RelationalQueryNode<RelationalNodeType> = RelationalQueryNode<RelationalNodeType>,
> {
  asNode(): NodeType

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(
    ctor: QueryBuilderCtor<RowType>,
    name: string,
    mode?: ExecutionMode,
  ): Query<RowType>
}

export interface NamedRelationalRowProvider<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> extends RelationalRowProvider<RowType, NamedRowGenerator> {
  tableName: TableName
}

/**
 * Constructor type
 */
export type QueryBuilderCtor<RowType extends RelationalDataTable> = new (
  node: RelationalQueryNode<RelationalNodeType>,
) => RelationalQueryBuilder<RowType>

export type TableAlias = Record<
  keyof RelationalDataStore["tables"],
  keyof RelationalDataStore["tables"]
>

/**
 * Type that is capable of buliding {@link RelationalQueryNode} trees
 */
export type RelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable = never,
  Aliasing extends keyof DataStoreType["tables"] = never,
> = RelationalRowProvider<RowType> & {
  context?: RelationalQueryNode<RelationalNodeType>
  tableAlias: TableAlias

  withTableAlias<
    TableName extends keyof Omit<DataStoreType["tables"], Aliasing>,
    Alias extends string,
  >(
    table: TableName,
    alias: Alias,
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
    RowType,
    Aliasing | Alias
  >

  withCte<Alias extends string, TableType extends RelationalDataTable>(
    alias: Alias,
    source: RowProviderBuilder<DataStoreType, RowType, Aliasing, TableType>,
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, Alias, TableType>,
    RowType,
    Aliasing
  >

  from<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName,
  ): TableNodeBuilder<DataStoreType, TableName>
}

export type RowProviderBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable,
  Aliasing extends keyof DataStoreType["tables"],
  TableType extends RelationalDataTable,
> = (
  builder: RelationalNodeBuilder<DataStoreType, RowType, Aliasing>,
) => RelationalRowProvider<TableType>

export interface JoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> extends RelationalRowProvider<RowType> {
  join<
    JoinTarget extends Tables,
    JoinTable extends keyof Exclude<DataStoreType["tables"], Tables> & string,
    TableType extends RelationalDataTable,
  >(
    target: JoinTarget,
    joinTable: JoinTable,
    tableGenerator: TableGenerator<DataStoreType, JoinTable, TableType>,
    leftColumn: keyof DataStoreType["tables"][JoinTarget],
    rightColumn: keyof DataStoreType["tables"][JoinTable],
  ): JoinNodeBuilder<
    DataStoreType,
    Tables | JoinTable,
    MergedNonOverlappingType<RowType, TableType>
  >
}

export type TableGenerator<
  DataStoreType extends RelationalDataStore,
  JoinTable extends keyof DataStoreType["tables"],
  TableType extends RelationalDataTable,
> = (
  from: TableNodeBuilder<DataStoreType, JoinTable>,
) => NamedRelationalRowProvider<DataStoreType, JoinTable, TableType>

export interface TableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> extends NamedRelationalRowProvider<DataStoreType, TableName, RowType> {
  tableName: TableName
  builder: RelationalNodeBuilder<DataStoreType>
  tableAlias?: keyof DataStoreType["tables"]

  select(
    column: STAR,
  ): Omit<
    TableNodeBuilder<
      DataStoreType,
      TableName,
      DataStoreType["tables"][TableName]
    >,
    "select"
  >

  select<Column extends keyof DataStoreType["tables"][TableName]>(
    ...columns: Column[]
  ): Omit<
    TableNodeBuilder<
      DataStoreType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>
    >,
    "select"
  >

  join<
    JoinTable extends keyof DataStoreType["tables"],
    JoinRowType extends RelationalDataTable,
  >(
    joinTable: JoinTable,
    tableGenerator: TableGenerator<DataStoreType, JoinTable, JoinRowType>,
    leftColumn: keyof DataStoreType["tables"][TableName],
    rightColumn: keyof DataStoreType["tables"][JoinTable],
    type?: JoinType,
  ): JoinNodeBuilder<
    DataStoreType,
    TableName | JoinTable,
    MergedNonOverlappingType<RowType, JoinRowType>
  >

  alias<
    Column extends keyof RowType & keyof DataStoreType["tables"][TableName],
    Alias extends string,
  >(
    column: Column,
    alias: Alias,
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>
  >

  where(
    filter:
      | FilterGroup<DataStoreType["tables"][TableName]>
      | FilterTypes<DataStoreType["tables"][TableName]>,
  ): Omit<TableNodeBuilder<DataStoreType, TableName, RowType>, "where">
}

/**
 * Filter for rows where `column=value`
 *
 * @param column The column to use
 * @param value The value to use for the query
 * @returns A filter
 */
export const eq: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.EQ)

/**
 * Filter for rows where `column>value`
 *
 * @param column The column to use
 * @param value The value to use for the query
 * @returns A filter
 */
export const gt: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GT)

/**
 * Filter for rows where `column>=value`
 *
 * @param column The column to use
 * @param value The value to use for the query
 * @returns A filter
 */
export const gte: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GTE)

/**
 * Filter for rows where `column<value`
 *
 * @param column The column to use
 * @param value The value to use for the query
 * @returns A filter
 */
export const lt: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LT)

/**
 * Filter for rows where `column<=value`
 *
 * @param column The column to use
 * @param value The value to use for the query
 * @returns A filter
 */
export const lte: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LTE)

/**
 * Groups a set of filters with `AND` clauses
 * @param clauses The filters to group
 * @returns A group of filters
 */
export const and: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.AND, ...clauses)
/**
 * Groups a set of filters with `OR` clauses
 * @param clauses The filters to group
 * @returns A group of filters
 */
export const or: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.OR, ...clauses)
/**
 * Groups a set of filters with `NOT` clauses
 * @param clauses The filters to group
 * @returns A group of filters
 */
export const not: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.NOT, ...clauses)

/**
 * Filter for rows where `column.contains(value)` (often as regex)
 * @param column The string typed column to check for containment
 * @param value The value to check for the string containing
 * @returns A filter
 */
export const contains = <
  TableType extends RelationalDataTable,
  Column extends PropertiesOfType<TableType, string>,
>(
  column: Column,
  value: string,
): FilterTypes<TableType> => {
  return {
    type: ContainmentObjectType.STRING,
    column,
    value,
    op: ColumnValueContainsOperation.IN,
  }
}

/**
 * Filter for rows where `values in column`
 * @param column The array typed column to check for item containment
 * @param values The set of values to check for existence of in the array
 * @returns A filter
 */
export const containsItems = <
  RowType extends RelationalDataTable,
  ContainingColumn extends ArrayProperty<RowType>,
  ColumnValue extends ArrayItemType<RowType, ContainingColumn>,
>(
  column: ContainingColumn,
  ...values: ColumnValue[]
): FilterTypes<RowType> => {
  return {
    type: ContainmentObjectType.ARRAY,
    column,
    value: values.length === 1 ? values[0] : values,
    op: ColumnValueContainsOperation.IN,
  }
}

function ColumnGroupFilterBuilder<RowType extends RelationalDataTable>(
  op: BooleanOperation,
  ...clauses: (FilterGroup<RowType> | FilterTypes<RowType>)[]
): FilterGroup<RowType> {
  return {
    op,
    filters: clauses,
  }
}

function ColumnFilterBuilder<
  RowType extends RelationalDataTable,
  Column extends keyof RowType,
  ColumnType extends RowType[Column],
>(
  column: Column,
  value: ColumnType,
  op: ColumnFilteringOperation,
): FilterTypes<RowType> {
  return {
    column,
    value,
    op,
  }
}

type BooleanFilter = <RowType extends RelationalDataTable>(
  ...clauses: (FilterGroup<RowType> | FilterTypes<RowType>)[]
) => FilterGroup<RowType>

type ColumnFilterFn = <
  RowType extends RelationalDataTable,
  Column extends keyof RowType,
  ColumnType extends RowType[Column],
>(
  column: Column,
  value: ColumnType,
) => FilterTypes<RowType>
