/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils.js"
import type {
  QueryParameters,
  RelationalDataStore,
  RelationalDataTable,
  STAR,
} from ".."
import {
  ParameterizedQueryBuilderBase,
  QueryBuilderBase,
} from "../../query/builder"
import type {
  ExecutionMode,
  ParameterizedQuery,
  Query,
} from "../../query/index"
import {
  RelationalNodeType,
  type FilterGroup,
  type FilterTypes,
  type JoinType,
  type NamedRowGenerator,
  type ParameterNode,
  type RelationalNodeProvider,
  type RelationalQueryNode,
  type TableAlias,
} from "../ast"
import {
  type ArrayItemType,
  type ArrayProperty,
  type MatchingProperty,
  type MergedNonOverlappingType,
  type ModifiedStore,
  type PropertyOfType,
} from "../types"
import {
  DefaultParameterizedRelationalNodeBuilder,
  DefaultRelationalNodeBuilder,
} from "./internal"

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

export function useParameterizedStore<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
>(): ParameterizedRelationalNodeBuilder<DataStoreType, ParameterType> {
  return new DefaultParameterizedRelationalNodeBuilder()
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
/**
 * Represents a relational query that will return some value of {@link RowType}
 * from the given {@link DataStoreType}
 */
export interface RelationalRowProvider<
  RowType extends RelationalDataTable,
  NodeType extends
    RelationalQueryNode<RelationalNodeType> = RelationalQueryNode<RelationalNodeType>,
> extends RelationalNodeProvider<NodeType> {
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

/**
 * Represents an extension of the {@link RelationalRowProvider} that is named
 * (either alias or existing)
 */
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

  /**
   * Create a named alias for one of the tables (most useful for joins)
   *
   * @param table The table to create an alias for
   * @param alias The name of the table alias
   */
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

  /**
   * Create a common table expression (CTE) for the given
   * {@link RowProviderBuilder} output with the given name
   *
   * @param alias The name of the CTE to create
   * @param source The {@link RowProviderBuilder} that provides the CTE definition
   */
  withCte<Alias extends string, TableType extends RelationalDataTable>(
    alias: Alias,
    source: RowProviderBuilder<DataStoreType, RowType, Aliasing, TableType>,
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, Alias, TableType>,
    RowType,
    Aliasing
  >

  /**
   *
   * @param tableName The name of the table to select from
   */
  select<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName,
  ): TableNodeBuilder<DataStoreType, TableName>
}

/**
 * Custom function for building {@link RelationalRowProvider} given the {@link RelationalNodeBuilder}
 */
export type RowProviderBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable,
  Aliasing extends keyof DataStoreType["tables"],
  TableType extends RelationalDataTable,
> = (
  builder: RelationalNodeBuilder<DataStoreType, RowType, Aliasing>,
) => RelationalRowProvider<TableType>

/**
 * Builder to help manipulate single or multi-join operations
 */
export interface JoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> extends RelationalRowProvider<RowType> {
  /**
   *
   * @param target The target table from the existing joins
   * @param joinTable The table to join with
   * @param tableGenerator The {@link TableGenerator} for creating the table definition
   * @param leftColumn The column on the {@link target} to join wth
   * @param rightColumn The column on the {@link joinTable} to join with
   */
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

/**
 * Custom function that creates a {@link NamedRelationalRowProvider} given a {@link TableNodeBuilder}
 */
export type TableGenerator<
  DataStoreType extends RelationalDataStore,
  JoinTable extends keyof DataStoreType["tables"],
  TableType extends RelationalDataTable,
> = (
  from: TableNodeBuilder<DataStoreType, JoinTable>,
) => NamedRelationalRowProvider<DataStoreType, JoinTable, TableType>

/**
 * Custom interface for generating table clauses that implements the
 * {@link NamedRelationalRowProvider} and interface
 */
export interface TableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> extends NamedRelationalRowProvider<DataStoreType, TableName, RowType> {
  tableName: TableName
  builder: RelationalNodeBuilder<DataStoreType>
  tableAlias?: keyof DataStoreType["tables"]

  /**
   * Selects all columns in the table
   *
   * @param column The {@link STAR} column (all) to select
   */
  columns(
    column: STAR,
  ): Omit<
    TableNodeBuilder<
      DataStoreType,
      TableName,
      DataStoreType["tables"][TableName]
    >,
    "columns"
  >

  /**
   * Selects a subset of columns from the table
   *
   * @param columns The set of columns to select from the table
   */
  columns<Column extends keyof DataStoreType["tables"][TableName]>(
    ...columns: Column[]
  ): Omit<
    TableNodeBuilder<
      DataStoreType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>
    >,
    "columns"
  >

  /**
   * Joins the current table to the other {@link NamedRowGenerator}
   *
   * @param joinTable The table to join with
   * @param tableGenerator The {@link TableGenerator} to create that definition
   * @param leftColumn The column from the current table to join on
   * @param rightColumn The column from the target {@link joinTable} to reference with
   * @param type The type of join to use (default is {@link JoinType.INNER})
   */
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

  /**
   * Alias one of the selected columns
   *
   * @param column The column to alias
   * @param alias The new alias name
   */
  withColumnAlias<
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

  /**
   * Define the where clause for filtering rows from the result
   *
   * @param filter The {@link FilterGroup} or {@link FilterTypes} to use
   */
  where(
    composer: WhereComposer<DataStoreType["tables"][TableName]>,
  ): Omit<TableNodeBuilder<DataStoreType, TableName, RowType>, "where">
}

export type WhereComposer<Table extends RelationalDataTable> = (
  builder: WhereBuilder<Table>,
) => WhereBuilder<Table>

export interface WhereBuilder<Table extends RelationalDataTable> {
  eq<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table>

  gt<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table>

  gte<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table>

  lt<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table>

  lte<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table>

  and(...clauses: WhereBuilder<Table>[]): WhereBuilder<Table>

  or(...clauses: WhereBuilder<Table>[]): WhereBuilder<Table>

  not(...clauses: WhereBuilder<Table>[]): WhereBuilder<Table>

  contains<Column extends PropertyOfType<Table, string>>(
    column: Column,
    value: string,
  ): WhereBuilder<Table>

  containsItems<
    Column extends ArrayProperty<Table>,
    ColumnValue extends ArrayItemType<Table, Column>,
  >(
    column: Column,
    ...values: ColumnValue[]
  ): WhereBuilder<Table>

  current?: FilterGroup<Table> | FilterTypes<Table>
}

export const parameter: ParameterSelector = (parameter) => {
  return {
    nodeType: RelationalNodeType.PARAMETER,
    name: parameter as string,
  }
}

type ParameterSelector = <
  RowType extends RelationalDataTable,
  Column extends keyof RowType,
  ParameterType extends QueryParameters,
  MatchingColumns extends MatchingProperty<RowType, ParameterType, Column>,
>(
  parameter: MatchingColumns,
) => ParameterNode

export type ParameterizedWhereComposer<
  Table extends RelationalDataTable,
  ParameterType extends QueryParameters,
> = (
  builder: ParameterizedWhereBuilder<Table, ParameterType>,
) => ParameterizedWhereBuilder<Table, ParameterType>

export interface ParameterizedWhereBuilder<
  Table extends RelationalDataTable,
  ParameterType extends QueryParameters,
> {
  eq<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  gt<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  gte<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  lt<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  lte<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  and(
    ...clauses: ParameterizedWhereBuilder<Table, ParameterType>[]
  ): ParameterizedWhereBuilder<Table, ParameterType>

  or(
    ...clauses: ParameterizedWhereBuilder<Table, ParameterType>[]
  ): ParameterizedWhereBuilder<Table, ParameterType>

  not(
    ...clauses: ParameterizedWhereBuilder<Table, ParameterType>[]
  ): ParameterizedWhereBuilder<Table, ParameterType>

  contains<
    Column extends PropertyOfType<Table, string>,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  containsItems<
    Column extends ArrayProperty<Table>,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType>

  current?: FilterGroup<Table> | FilterTypes<Table>
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
 * from the given {@link DataStoreType} with the given {@link ParameterType}
 */
export interface ParameterizedRelationalRowProvider<
  RowType extends RelationalDataTable,
  ParameterType extends QueryParameters,
  NodeType extends
    RelationalQueryNode<RelationalNodeType> = RelationalQueryNode<RelationalNodeType>,
> extends RelationalNodeProvider<NodeType> {
  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(
    ctor: ParameterizedQueryBuilderCtor<RowType, ParameterType>,
    name: string,
    mode?: ExecutionMode,
  ): ParameterizedQuery<RowType, ParameterType>
}

/**
 * Represents an extension of the {@link ParameterizedRelationalRowProvider} that is named
 * (either alias or existing)
 */
export interface ParameterizedNamedRelationalRowProvider<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> extends ParameterizedRelationalRowProvider<
    RowType,
    ParameterType,
    NamedRowGenerator
  > {
  tableName: TableName
}

/**
 * Parameterized constructor type
 */
export type ParameterizedQueryBuilderCtor<
  RowType extends RelationalDataTable,
  ParameterType extends object,
> = new (
  node: RelationalQueryNode<RelationalNodeType>,
) => ParameterizedRelationalQueryBuilder<RowType, ParameterType>

/**
 * Type that is capable of buliding {@link RelationalQueryNode} trees
 */
export type ParameterizedRelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  RowType extends RelationalDataTable = never,
  Aliasing extends keyof DataStoreType["tables"] = never,
> = ParameterizedRelationalRowProvider<RowType, ParameterType> & {
  context?: RelationalQueryNode<RelationalNodeType>
  tableAlias: TableAlias

  /**
   * Create a named alias for one of the tables (most useful for joins)
   *
   * @param table The table to create an alias for
   * @param alias The name of the table alias
   */
  withTableAlias<
    TableName extends keyof Omit<DataStoreType["tables"], Aliasing>,
    Alias extends string,
  >(
    table: TableName,
    alias: Alias,
  ): ParameterizedRelationalNodeBuilder<
    ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
    ParameterType,
    RowType,
    Aliasing | Alias
  >

  /**
   * Create a common table expression (CTE) for the given
   * {@link RowProviderBuilder} output with the given name
   *
   * @param alias The name of the CTE to create
   * @param source The {@link RowProviderBuilder} that provides the CTE definition
   */
  withCte<Alias extends string, TableType extends RelationalDataTable>(
    alias: Alias,
    source: ParameterizedRowProviderBuilder<
      DataStoreType,
      ParameterType,
      RowType,
      Aliasing,
      TableType
    >,
  ): ParameterizedRelationalNodeBuilder<
    ModifiedStore<DataStoreType, Alias, TableType>,
    ParameterType,
    RowType,
    Aliasing
  >

  /**
   *
   * @param tableName The name of the table to select from
   */
  select<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName,
  ): ParameterizedTableNodeBuilder<DataStoreType, ParameterType, TableName>
}

/**
 * Custom function for building {@link RelationalRowProvider} given the {@link RelationalNodeBuilder}
 */
export type ParameterizedRowProviderBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  RowType extends RelationalDataTable,
  Aliasing extends keyof DataStoreType["tables"],
  TableType extends RelationalDataTable,
> = (
  builder: ParameterizedRelationalNodeBuilder<
    DataStoreType,
    ParameterType,
    RowType,
    Aliasing
  >,
) => ParameterizedRelationalRowProvider<TableType, ParameterType>

/**
 * Builder to help manipulate single or multi-join operations
 */
export interface ParameterizedJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> extends ParameterizedRelationalRowProvider<RowType, ParameterType> {
  /**
   *
   * @param target The target table from the existing joins
   * @param joinTable The table to join with
   * @param tableGenerator The {@link TableGenerator} for creating the table definition
   * @param leftColumn The column on the {@link target} to join wth
   * @param rightColumn The column on the {@link joinTable} to join with
   */
  join<
    JoinTarget extends Tables,
    JoinTable extends keyof Exclude<DataStoreType["tables"], Tables> & string,
    TableType extends RelationalDataTable,
  >(
    target: JoinTarget,
    joinTable: JoinTable,
    tableGenerator: ParameterizedTableGenerator<
      DataStoreType,
      ParameterType,
      JoinTable,
      TableType
    >,
    leftColumn: keyof DataStoreType["tables"][JoinTarget],
    rightColumn: keyof DataStoreType["tables"][JoinTable],
  ): ParameterizedJoinNodeBuilder<
    DataStoreType,
    ParameterType,
    Tables | JoinTable,
    MergedNonOverlappingType<RowType, TableType>
  >
}

/**
 * Custom function that creates a {@link NamedRelationalRowProvider} given a {@link TableNodeBuilder}
 */
export type ParameterizedTableGenerator<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  JoinTable extends keyof DataStoreType["tables"],
  TableType extends RelationalDataTable,
> = (
  from: ParameterizedTableNodeBuilder<DataStoreType, ParameterType, JoinTable>,
) => ParameterizedNamedRelationalRowProvider<
  DataStoreType,
  ParameterType,
  JoinTable,
  TableType
>

/**
 * Custom interface for generating table clauses that implements the
 * {@link NamedRelationalRowProvider} and interface
 */
export interface ParameterizedTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> extends ParameterizedNamedRelationalRowProvider<
    DataStoreType,
    ParameterType,
    TableName,
    RowType
  > {
  tableName: TableName
  builder: ParameterizedRelationalNodeBuilder<DataStoreType, ParameterType>
  tableAlias?: keyof DataStoreType["tables"]

  /**
   * Selects all columns in the table
   *
   * @param column The {@link STAR} column (all) to select
   */
  columns(
    column: STAR,
  ): Omit<
    ParameterizedTableNodeBuilder<
      DataStoreType,
      ParameterType,
      TableName,
      DataStoreType["tables"][TableName]
    >,
    "columns"
  >

  /**
   * Selects a subset of columns from the table
   *
   * @param columns The set of columns to select from the table
   */
  columns<Column extends keyof DataStoreType["tables"][TableName]>(
    ...columns: Column[]
  ): Omit<
    ParameterizedTableNodeBuilder<
      DataStoreType,
      ParameterType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>
    >,
    "columns"
  >

  /**
   * Joins the current table to the other {@link NamedRowGenerator}
   *
   * @param joinTable The table to join with
   * @param tableGenerator The {@link TableGenerator} to create that definition
   * @param leftColumn The column from the current table to join on
   * @param rightColumn The column from the target {@link joinTable} to reference with
   * @param type The type of join to use (default is {@link JoinType.INNER})
   */
  join<
    JoinTable extends keyof DataStoreType["tables"],
    JoinRowType extends RelationalDataTable,
  >(
    joinTable: JoinTable,
    tableGenerator: ParameterizedTableGenerator<
      DataStoreType,
      ParameterType,
      JoinTable,
      JoinRowType
    >,
    leftColumn: keyof DataStoreType["tables"][TableName],
    rightColumn: keyof DataStoreType["tables"][JoinTable],
    type?: JoinType,
  ): ParameterizedJoinNodeBuilder<
    DataStoreType,
    ParameterType,
    TableName | JoinTable,
    MergedNonOverlappingType<RowType, JoinRowType>
  >

  /**
   * Alias one of the selected columns
   *
   * @param column The column to alias
   * @param alias The new alias name
   */
  withColumnAlias<
    Column extends keyof RowType & keyof DataStoreType["tables"][TableName],
    Alias extends string,
  >(
    column: Column,
    alias: Alias,
  ): ParameterizedTableNodeBuilder<
    DataStoreType,
    ParameterType,
    TableName,
    AliasedType<RowType, Column, Alias>
  >

  /**
   * Define the where clause for filtering rows from the result
   *
   * @param filter The {@link FilterGroup} or {@link FilterTypes} to use
   */
  where(
    builder: ParameterizedWhereComposer<
      DataStoreType["tables"][TableName],
      ParameterType
    >,
  ): Omit<
    ParameterizedTableNodeBuilder<
      DataStoreType,
      ParameterType,
      TableName,
      RowType
    >,
    "where"
  >
}
