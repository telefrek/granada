/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable } from "."
import type { Query } from "../query"
import { QueryBuilderBase } from "../query/builder"
import {
  type CteClause,
  type FilterGroup,
  type RelationalQueryNode,
  type TableQueryNode,
  type WhereClause,
} from "./ast"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ContainmentItemType,
  type ContainmentProperty,
  type JoinType,
  type MatchingKey,
  type ModifiedStore,
} from "./types"

/**
 * Represents a {@link QueryBuilder} that is specifically for relational
 * database queries
 */
export abstract class RelationalQueryBuilder<
  T extends RelationalDataTable
> extends QueryBuilderBase<T> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }
}

/**
 * Constructor type
 */
type QueryBuilderCtor<RowType extends RelationalDataTable> = new (
  node: RelationalQueryNode<RelationalNodeType>
) => RelationalQueryBuilder<RowType>

/**
 * Create a context for the given {@link DataStoreType}
 *
 * @returns A{@link RelationalQueryContext} for the given {@link DataStoreType}
 */
export const useDataStore = <
  DataStoreType extends RelationalDataStore
>(): RelationalQueryContext<DataStoreType> => {
  return new RelationalQueryContextBase()
}

/**
 * Helper interface for extracting the current {@link RelationalQueryNode}
 */
export interface RelationalQueryNodeBuilder {
  readonly node: Readonly<RelationalQueryNode<RelationalNodeType>>
}

/**
 * Represents a relational query that will return some value of {@link RowType}
 * from the given {@link DataStoreType}
 */
export interface RelationalDataSource<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable
> extends RelationalQueryNodeBuilder {
  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(ctor: QueryBuilderCtor<RowType>): Query<RowType>
}

export function testFrom<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"]
>(table: TargetTable): RelationalTableBuilder<DataStoreType, TargetTable> {
  return new RelationalTableBuilderImpl({
    table,
    nodeType: RelationalNodeType.TABLE,
  })
}

/**
 * Handles building out {@link TableQueryNode} instances
 */
export interface RelationalTableBuilder<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TargetTable]
> extends RelationalDataSource<DataStoreType, RowType> {
  /**
   * Alias a column to have a different name on the returned row type
   *
   * @param column The column to rename
   * @param alias The new column alias
   * @returns A new {@link SelectBuilder} with the modified types
   */
  alias<
    OldColumn extends keyof RowType &
      keyof DataStoreType["tables"][TargetTable] &
      string,
    AliasColumn extends string
  >(
    column: OldColumn,
    alias: AliasColumn
  ): RelationalTableBuilder<
    DataStoreType,
    TargetTable,
    AliasedType<RowType, OldColumn, AliasColumn>
  >

  /**
   * Attach the given {@link WhereClause} to the query
   *
   * @param clause The {@link WhereClause} to use for this query
   */
  where(
    clause: WhereClause<DataStoreType["tables"][TargetTable]>
  ): Omit<RelationalTableBuilder<DataStoreType, TargetTable, RowType>, "where">

  /**
   *
   * @param columns The set of columns to select
   * @returns An updated {@link SelectBuilder}
   */
  select<Column extends keyof DataStoreType["tables"][TargetTable]>(
    ...columns: Column[]
  ): Omit<
    RelationalTableBuilder<
      DataStoreType,
      TargetTable,
      { [key in Column]: DataStoreType["tables"][TargetTable][key] }
    >,
    "select"
  >
}

/**
 * Class to manage some context around the current {@link RelationalDataStore}
 */
export interface RelationalQueryContext<
  DataStoreType extends RelationalDataStore
> {
  /**
   * Starts a new CTE for the current query
   *
   * @param name The name for the CTE
   * @param query The {@link RelationalDataSource} that generates the CTE
   * @returns
   */
  with<TableName extends string, RowType extends RelationalDataTable>(
    name: TableName,
    query: RelationalDataSource<DataStoreType, RowType>
  ): RelationalQueryContext<ModifiedStore<DataStoreType, TableName, RowType>>

  /**
   * Starts a new query fragment using the given table as a source
   *
   * @param table The {@link TargetTable} to use for this query segment
   *
   * @returns A new {@link RelationalTableBuilder}
   */
  from<TargetTable extends keyof DataStoreType["tables"]>(
    table: TargetTable
  ): RelationalTableBuilder<DataStoreType, TargetTable>

  join<
    Left extends keyof DataStoreType["tables"],
    Right extends keyof DataStoreType["tables"],
    LeftColumn extends keyof DataStoreType["tables"][Left],
    RightColumn extends keyof DataStoreType["tables"][Right] &
      MatchingKey<
        DataStoreType["tables"][Left],
        DataStoreType["tables"][Right],
        LeftColumn
      >
  >(
    left: Left,
    right: Right,
    leftColumn: LeftColumn,
    rightColumn: RightColumn,
    joinType: JoinType
  ): void
}

export const eq: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.EQ)

export const gt: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GT)

export const gte: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GTE)

export const lt: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LT)

export const lte: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LTE)

export const and: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.AND, ...clauses)

export const or: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.OR, ...clauses)

export const not: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.NOT, ...clauses)

export const contains = <
  RowType extends RelationalDataTable,
  ContainingColumn extends ContainmentProperty<RowType>,
  ColumnValue extends ContainmentItemType<RowType, ContainingColumn>
>(
  column: ContainingColumn,
  value: ColumnValue
): WhereClause<RowType> => {
  return {
    nodeType: RelationalNodeType.WHERE,
    filter: {
      column,
      value,
      op: ColumnValueContainsOperation.IN,
    },
  }
}

/**
 * Class to manage some context around the current {@link RelationalDataStore}
 */
export class RelationalQueryContextBase<
  DataStoreType extends RelationalDataStore
> implements RelationalQueryContext<DataStoreType>
{
  private current?: RelationalQueryNode<RelationalNodeType>

  constructor(node?: RelationalQueryNode<RelationalNodeType>) {
    this.current = node
  }

  with<TableName extends string, RowType extends RelationalDataTable>(
    name: TableName,
    query: RelationalDataSource<DataStoreType, RowType>
  ): RelationalQueryContext<ModifiedStore<DataStoreType, TableName, RowType>> {
    return new RelationalQueryContextBase({
      parent: this.current,
      nodeType: RelationalNodeType.CTE,
      source: query.node,
      tableName: name,
    } as CteClause<ModifiedStore<DataStoreType, TableName, RowType>, TableName>)
  }

  from<TargetTable extends keyof DataStoreType["tables"]>(
    table: TargetTable
  ): RelationalTableBuilder<DataStoreType, TargetTable> {
    return new RelationalTableBuilderImpl({
      parent: this.current,
      table,
      nodeType: RelationalNodeType.TABLE,
    })
  }

  join<
    Left extends keyof DataStoreType["tables"],
    Right extends keyof DataStoreType["tables"],
    LeftColumn extends keyof DataStoreType["tables"][Left],
    RightColumn extends keyof DataStoreType["tables"][Right] &
      MatchingKey<
        DataStoreType["tables"][Left],
        DataStoreType["tables"][Right],
        LeftColumn
      >
  >(
    left: Left,
    right: Right,
    leftColumn: LeftColumn,
    rightColumn: RightColumn,
    joinType: JoinType
  ): void {}
}

/**
 * Handles building out {@link TableQueryNode} instances
 */
class RelationalTableBuilderImpl<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable
> implements RelationalTableBuilder<DataStoreType, TargetTable, RowType>
{
  private clause: TableQueryNode<
    DataStoreType,
    TargetTable,
    DataStoreType["tables"][TargetTable],
    RowType
  >

  constructor(
    clause: TableQueryNode<
      DataStoreType,
      TargetTable,
      DataStoreType["tables"][TargetTable],
      RowType
    >
  ) {
    this.clause = clause
  }

  get node(): Readonly<RelationalQueryNode<RelationalNodeType>> {
    return this.clause
  }

  /**
   * Alias a column to have a different name on the returned row type
   *
   * @param column The column to rename
   * @param alias The new column alias
   * @returns A new {@link SelectBuilder} with the modified types
   */
  alias<
    OldColumn extends keyof RowType &
      keyof DataStoreType["tables"][TargetTable],
    AliasColumn extends string
  >(
    column: OldColumn,
    alias: AliasColumn
  ): RelationalTableBuilder<
    DataStoreType,
    TargetTable,
    AliasedType<RowType, OldColumn, AliasColumn>
  > {
    // Build the new clause based on the altered return type
    const aliasedClause: TableQueryNode<
      DataStoreType,
      TargetTable,
      DataStoreType["tables"][TargetTable],
      AliasedType<RowType, OldColumn, AliasColumn>
    > = {
      parent: this.clause.parent,
      nodeType: this.clause.nodeType,
      where: this.clause.where,
      table: this.clause.table,
      select: {
        nodeType: RelationalNodeType.SELECT,
        columns: this.clause.select?.columns ?? [],
        aliasing: this.clause.select?.aliasing ?? [],
      },
    }

    // Add the new alias
    aliasedClause.select?.aliasing?.push({ column, alias })

    return new RelationalTableBuilderImpl(aliasedClause)
  }

  where(
    clause: WhereClause<DataStoreType["tables"][TargetTable]>
  ): Omit<
    RelationalTableBuilder<DataStoreType, TargetTable, RowType>,
    "where"
  > {
    this.clause.where = clause
    return this
  }

  /**
   *
   * @param columns The set of columns to select
   * @returns An updated {@link SelectBuilder}
   */
  select<
    Column extends keyof DataStoreType["tables"][TargetTable],
    SelectType extends {
      [key in Column]: DataStoreType["tables"][TargetTable][key]
    }
  >(
    ...columns: Column[]
  ): Omit<
    RelationalTableBuilder<DataStoreType, TargetTable, SelectType>,
    "select"
  > {
    return new RelationalTableBuilderImpl({
      parent: this.clause.parent,
      table: this.clause.table,
      nodeType: RelationalNodeType.TABLE,
      select: {
        columns: columns ?? [],
        nodeType: RelationalNodeType.SELECT,
        aliasing: this.clause.select?.aliasing,
      },
      where: this.clause.where,
    })
  }

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.clause).build()
  }
}

type BooleanFilter = <RowType>(
  ...clauses: WhereClause<RowType>[]
) => WhereClause<RowType>

type ColumnFilter = <
  RowType,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType
) => WhereClause<RowType>

function ColumnGroupFilterBuilder<RowType>(
  op: BooleanOperation,
  ...clauses: WhereClause<RowType>[]
): WhereClause<RowType> {
  return {
    nodeType: RelationalNodeType.WHERE,
    filter: {
      op,
      filters: clauses.map((c) => c.filter),
    } as FilterGroup<RowType>,
  }
}

function ColumnFilterBuilder<
  RowType,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType,
  op: ColumnFilteringOperation
): WhereClause<RowType> {
  return {
    nodeType: RelationalNodeType.WHERE,
    filter: {
      column,
      value,
      op,
    },
  }
}
