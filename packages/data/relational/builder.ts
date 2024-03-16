/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable, STAR } from "."
import type { Query } from "../query"
import type { QueryNode } from "../query/ast"
import { QueryBuilderBase } from "../query/builder"
import { QueryError } from "../query/error"
import {
  ContainmentObjectType,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinColumnFilter,
  type JoinGroupFilter,
  type JoinQueryNode,
  type RelationalQueryNode,
  type SelectClause,
  type TableQueryNode,
  type WhereClause,
} from "./ast"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  JoinType,
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
  type MatchingProperty,
  type MergedNonOverlappingType,
  type ModifiedStore,
  type PropertiesOfType,
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
 * Represents a relational query that will return some value of {@link RowType}
 * from the given {@link DataStoreType}
 */
export type RelationalRowProvider<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable
> = {
  asNode(): RelationalQueryNode<RelationalNodeType>

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(ctor: QueryBuilderCtor<RowType>): Query<RowType>
}

export type NamedRelationalRowProvider<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable
> = RelationalRowProvider<DataStoreType, RowType> & {
  tableName: TableName
}

/**
 * Type that is capable of buliding {@link RelationalQueryNode} trees
 */
export type RelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable = never
> = RelationalRowProvider<DataStoreType, RowType> & {
  projections: Map<string, QueryNode>

  from<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName
  ): TableNodeBuilder<DataStoreType, TableName>
}

export function useDataStore<
  DataStoreType extends RelationalDataStore
>(): RelationalNodeBuilder<DataStoreType> {
  return new DefaultRelationalNodeBuilder()
}

export function aliasTable<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  TableAlias extends string,
  RowType extends RelationalDataTable
>(
  tableAlias: TableAlias,
  original: TableNodeBuilder<DataStoreType, TableName, RowType>
): RelationalNodeBuilder<
  ModifiedStore<DataStoreType, TableAlias, RowType>,
  RowType
> {
  // const original = source(builder)
  original.tableAlias = tableAlias
  const builder = new DefaultRelationalNodeBuilder<
    ModifiedStore<DataStoreType, TableAlias, RowType>,
    RowType
  >()
  builder.projections.set(tableAlias, original.asNode())

  return builder
}

export function cte<
  DataStoreType extends RelationalDataStore,
  Alias extends string,
  RowType extends RelationalDataTable
>(
  builder: RelationalNodeBuilder<DataStoreType>,
  alias: Alias,
  source: (
    builder: RelationalNodeBuilder<DataStoreType>
  ) => RelationalRowProvider<DataStoreType, RowType>
): RelationalNodeBuilder<ModifiedStore<DataStoreType, Alias, RowType>> {
  builder.projections.set(alias, {
    tableName: alias,
    nodeType: RelationalNodeType.CTE,
    source: source(builder).asNode(),
  } as CteClause<ModifiedStore<DataStoreType, Alias, RowType>, Alias, RowType>)

  return new DefaultRelationalNodeBuilder(builder.projections)
}

export class DefaultRelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable = never
> implements RelationalNodeBuilder<DataStoreType, RowType>
{
  projections: Map<string, QueryNode>

  asNode(): RelationalQueryNode<RelationalNodeType> {
    throw new QueryError("cannot translate a RelationalNodeBuilder directly")
  }

  constructor(projections?: Map<string, QueryNode>) {
    this.projections = projections ?? new Map()
  }

  from<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName]
  > {
    return new DefaultTableNodeBuilder<
      DataStoreType,
      TableName,
      DataStoreType["tables"][TableName]
    >(tableName, this.projections.get(tableName as string))
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    throw new QueryError(
      "invalid to build a query without a valid table clause"
    )
  }
}

type TableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName]
> = NamedRelationalRowProvider<DataStoreType, TableName, RowType> & {
  tableName: TableName
  tableAlias?: keyof DataStoreType["tables"]

  select(
    column: STAR
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName]
  >

  select<Column extends keyof DataStoreType["tables"][TableName]>(
    ...columns: Column[]
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    Pick<DataStoreType["tables"][TableName], Column>
  >

  join<
    JoinTable extends keyof DataStoreType["tables"],
    JoinRowType extends RelationalDataTable
  >(
    joinTable: NamedRelationalRowProvider<
      DataStoreType,
      JoinTable,
      JoinRowType
    >,
    filter:
      | JoinColumnFilter<
          DataStoreType["tables"][TableName],
          DataStoreType["tables"][JoinTable]
        >
      | JoinGroupFilter<
          DataStoreType["tables"][TableName],
          DataStoreType["tables"][JoinTable]
        >,
    type?: JoinType
  ): JoinNodeBuilder<DataStoreType, TableName, JoinTable, RowType, JoinRowType>

  alias<
    Column extends keyof RowType & keyof DataStoreType["tables"][TableName],
    Alias extends string
  >(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>
  >

  where(
    filter:
      | FilterGroup<DataStoreType["tables"][TableName]>
      | FilterTypes<DataStoreType["tables"][TableName]>
  ): TableNodeBuilder<DataStoreType, TableName, RowType>
}

class DefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = {}
> implements TableNodeBuilder<DataStoreType, TableName, RowType>
{
  asNode(): RelationalQueryNode<RelationalNodeType> {
    return {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.tableName,
      tableAlias: this.tableAlias,
      select: this.#select ?? {
        nodeType: RelationalNodeType.SELECT,
        columns: [],
      },
      where: this.#where,
      parent: this.#parent,
    } as TableQueryNode<DataStoreType, TableName, RowType>
  }

  tableName: TableName

  tableAlias?: keyof DataStoreType["tables"]
  #parent?: QueryNode
  #select?: SelectClause<
    DataStoreType,
    TableName,
    keyof DataStoreType["tables"][TableName],
    RowType
  >
  #where?: WhereClause<DataStoreType["tables"][TableName]>

  constructor(
    tableName: TableName,
    parent?: QueryNode,
    tableAlias?: keyof DataStoreType["tables"],
    select?: SelectClause<
      DataStoreType,
      TableName,
      keyof DataStoreType["tables"][TableName],
      RowType
    >,
    where?: WhereClause<DataStoreType["tables"][TableName]>
  ) {
    this.tableName = tableName
    this.tableAlias = tableAlias
    this.#parent = parent
    this.#select = select
    this.#where = where
  }
  join<
    JoinTable extends keyof DataStoreType["tables"],
    JoinRowType extends RelationalDataTable
  >(
    joinTable: NamedRelationalRowProvider<
      DataStoreType,
      JoinTable,
      JoinRowType
    >,
    filter:
      | JoinColumnFilter<
          DataStoreType["tables"][TableName],
          DataStoreType["tables"][JoinTable]
        >
      | JoinGroupFilter<
          DataStoreType["tables"][TableName],
          DataStoreType["tables"][JoinTable]
        >,
    type: JoinType = JoinType.INNER
  ): JoinNodeBuilder<
    DataStoreType,
    TableName,
    JoinTable,
    RowType,
    JoinRowType
  > {
    return new DefaultJoinNodeBuilder(this, joinTable, filter, type)
  }

  select(
    column: STAR
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName]
  >
  select<Column extends keyof DataStoreType["tables"][TableName]>(
    ...columns: Column[]
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    Pick<DataStoreType["tables"][TableName], Column>
  >
  select<Column extends keyof DataStoreType["tables"][TableName]>(
    column?: unknown,
    ...rest: unknown[]
  ):
    | TableNodeBuilder<
        DataStoreType,
        TableName,
        DataStoreType["tables"][TableName]
      >
    | TableNodeBuilder<
        DataStoreType,
        TableName,
        Pick<DataStoreType["tables"][TableName], Column>
      > {
    if (column === "*") {
      return new DefaultTableNodeBuilder<
        DataStoreType,
        TableName,
        DataStoreType["tables"][TableName]
      >(
        this.tableName,
        this.#parent,
        this.tableAlias,
        {
          nodeType: RelationalNodeType.SELECT,
          columns: column,
          aliasing: this.#select?.aliasing,
        },
        this.#where
      )
    }

    return new DefaultTableNodeBuilder<
      DataStoreType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>
    >(
      this.tableName,
      this.#parent,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: [column as Column].concat(rest as Column[]),
        aliasing: this.#select?.aliasing,
      },
      this.#where
    )
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.asNode()).build()
  }

  alias<
    Column extends keyof RowType & keyof DataStoreType["tables"][TableName],
    Alias extends string
  >(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>
  > {
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.#parent,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: this.#select?.columns ?? [],
        aliasing: (this.#select?.aliasing ?? []).concat([
          { column: column, alias },
        ]),
      },
      this.#where
    )
  }

  where(
    filter:
      | FilterGroup<DataStoreType["tables"][TableName]>
      | FilterTypes<DataStoreType["tables"][TableName]>
  ): TableNodeBuilder<DataStoreType, TableName, RowType> {
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.#parent,
      this.tableAlias,
      this.#select,
      {
        nodeType: RelationalNodeType.WHERE,
        filter,
      }
    )
  }
}

type JoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  LeftTable extends keyof DataStoreType["tables"],
  RightTable extends keyof DataStoreType["tables"],
  LeftRowType extends RelationalDataTable = DataStoreType["tables"][LeftTable],
  RightRowType extends RelationalDataTable = DataStoreType["tables"][RightTable],
  JoinedTables extends keyof DataStoreType["tables"] = LeftTable | RightTable
> = RelationalRowProvider<
  DataStoreType,
  MergedNonOverlappingType<LeftRowType, RightRowType>
> & {
  join<
    JoinTarget extends LeftTable | RightTable,
    JoinTable extends keyof Exclude<DataStoreType["tables"], JoinedTables> &
      string,
    RowType extends RelationalDataTable
  >(
    target: JoinTarget,
    source: NamedRelationalRowProvider<DataStoreType, JoinTable, RowType>,
    filter: JoinColumnFilter<
      DataStoreType["tables"][JoinTarget],
      DataStoreType["tables"][JoinTable]
    >
  ): JoinNodeBuilder<
    DataStoreType,
    JoinTarget,
    JoinTable,
    MergedNonOverlappingType<LeftRowType, RightRowType>,
    RowType,
    JoinedTables | JoinTable
  >
}

class DefaultJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  LeftTable extends keyof DataStoreType["tables"],
  RightTable extends keyof DataStoreType["tables"],
  LeftRowType extends RelationalDataTable,
  RightRowType extends RelationalDataTable
> implements
    JoinNodeBuilder<
      DataStoreType,
      LeftTable,
      RightTable,
      LeftRowType,
      RightRowType
    >
{
  leftSource: NamedRelationalRowProvider<DataStoreType, LeftTable, LeftRowType>
  rightSource: NamedRelationalRowProvider<
    DataStoreType,
    RightTable,
    RightRowType
  >
  filter:
    | JoinColumnFilter<
        DataStoreType["tables"][LeftTable],
        DataStoreType["tables"][RightTable],
        keyof DataStoreType["tables"][LeftTable],
        MatchingProperty<
          DataStoreType["tables"][LeftTable],
          DataStoreType["tables"][RightTable],
          keyof DataStoreType["tables"][LeftTable]
        >
      >
    | JoinGroupFilter<
        DataStoreType["tables"][LeftTable],
        DataStoreType["tables"][RightTable]
      >
  joinType: JoinType

  constructor(
    leftSource: NamedRelationalRowProvider<
      DataStoreType,
      LeftTable,
      LeftRowType
    >,
    rightSource: NamedRelationalRowProvider<
      DataStoreType,
      RightTable,
      RightRowType
    >,
    filter:
      | JoinColumnFilter<
          DataStoreType["tables"][LeftTable],
          DataStoreType["tables"][RightTable],
          keyof DataStoreType["tables"][LeftTable],
          MatchingProperty<
            DataStoreType["tables"][LeftTable],
            DataStoreType["tables"][RightTable],
            keyof DataStoreType["tables"][LeftTable]
          >
        >
      | JoinGroupFilter<
          DataStoreType["tables"][LeftTable],
          DataStoreType["tables"][RightTable]
        >,
    joinType: JoinType
  ) {
    this.leftSource = leftSource
    this.rightSource = rightSource
    this.filter = filter
    this.joinType = joinType
  }

  join<
    JoinTarget extends LeftTable | RightTable,
    JoinTable extends keyof Exclude<
      DataStoreType["tables"],
      LeftTable | RightTable
    > &
      string,
    RowType extends RelationalDataTable
  >(
    target: JoinTarget,
    source: NamedRelationalRowProvider<DataStoreType, JoinTable, RowType>,
    filter: JoinColumnFilter<
      DataStoreType["tables"][JoinTarget],
      DataStoreType["tables"][JoinTable]
    >
  ): JoinNodeBuilder<
    DataStoreType,
    JoinTarget,
    JoinTable,
    MergedNonOverlappingType<LeftRowType, RightRowType>,
    RowType,
    LeftTable | RightTable | JoinTable
  > {
    return new DefaultJoinNodeBuilder(
      { ...this, tableName: target, asNode: this.asNode.bind(this) },
      source,
      filter,
      JoinType.INNER
    )
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    const join: JoinQueryNode<
      DataStoreType,
      DataStoreType["tables"][LeftTable],
      DataStoreType["tables"][RightTable]
    > = {
      nodeType: RelationalNodeType.JOIN,
      left: {
        tableName: this.leftSource.tableName,
        ...this.leftSource.asNode(),
      },
      right: {
        tableName: this.rightSource.tableName,
        ...this.rightSource.asNode(),
      },
      filter: this.filter,
      type: this.joinType,
    }

    return join
  }

  build(
    ctor: QueryBuilderCtor<MergedNonOverlappingType<LeftRowType, RightRowType>>
  ): Query<MergedNonOverlappingType<LeftRowType, RightRowType>> {
    return new ctor(this.asNode()).build()
  }
}

export const eq: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.EQ)

export const joinEq: JoinColumnFilterFn = (leftColumn, rightColumn) =>
  JoinColumnFilterBuilder(leftColumn, rightColumn, ColumnFilteringOperation.EQ)

export const gt: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GT)

export const gte: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GTE)

export const lt: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LT)

export const lte: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LTE)

export const and: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.AND, ...clauses)

export const or: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.OR, ...clauses)

export const not: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.NOT, ...clauses)

export const contains = <
  TableType extends RelationalDataTable,
  Column extends PropertiesOfType<TableType, string>
>(
  column: Column,
  value: string
): FilterTypes<TableType> => {
  return {
    type: ContainmentObjectType.STRING,
    column,
    value,
    op: ColumnValueContainsOperation.IN,
  }
}

export const containsItems = <
  RowType extends RelationalDataTable,
  ContainingColumn extends ArrayProperty<RowType>,
  ColumnValue extends ArrayItemType<RowType, ContainingColumn>
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

type BooleanFilter = <RowType extends RelationalDataTable>(
  ...clauses: (FilterGroup<RowType> | FilterTypes<RowType>)[]
) => FilterGroup<RowType>

type ColumnFilterFn = <
  RowType extends RelationalDataTable,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType
) => FilterTypes<RowType>

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
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType,
  op: ColumnFilteringOperation
): FilterTypes<RowType> {
  return {
    column,
    value,
    op,
  }
}

type JoinColumnFilterFn = <
  LeftType extends RelationalDataTable,
  RightType extends RelationalDataTable,
  LeftColumn extends keyof LeftType,
  RightColumn extends MatchingProperty<LeftType, RightType, LeftColumn>
>(
  leftColumn: LeftColumn,
  rightColumn: RightColumn
) => JoinColumnFilter<
  LeftType,
  RightType,
  LeftColumn,
  MatchingProperty<LeftType, RightType, LeftColumn>
>

function JoinColumnFilterBuilder<
  LeftType extends RelationalDataTable,
  RightType extends RelationalDataTable,
  LeftColumn extends keyof LeftType,
  RightColumn extends MatchingProperty<LeftType, RightType, LeftColumn>
>(
  leftColumn: LeftColumn,
  rightColumn: RightColumn,
  op: ColumnFilteringOperation
): JoinColumnFilter<
  LeftType,
  RightType,
  LeftColumn,
  MatchingProperty<LeftType, RightType, LeftColumn>
> {
  return {
    leftColumn,
    rightColumn,
    op,
  }
}
