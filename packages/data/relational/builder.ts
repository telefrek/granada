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
  RelationalNodeType,
  type ArrayItemType,
  type ArrayProperty,
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

export function from<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  TableAlias extends string,
  Builder extends RelationalNodeBuilder<DataStoreType>,
  RowType extends RelationalDataTable
>(
  tableAlias: TableAlias,
  builder: Builder,
  source: (
    builder: Builder
  ) => TableNodeBuilder<DataStoreType, TableName, RowType>
): DefaultRelationalNodeBuilder<
  ModifiedStore<DataStoreType, TableAlias, RowType>,
  RowType
> {
  const original = source(builder)
  original.tableAlias = tableAlias
  builder.projections.set(tableAlias, original.asNode())

  return new DefaultRelationalNodeBuilder<
    ModifiedStore<DataStoreType, TableAlias, RowType>,
    RowType
  >(builder.projections)
}

export function cte<
  DataStoreType extends RelationalDataStore,
  Alias extends string,
  Builder extends RelationalNodeBuilder<DataStoreType>,
  RowType extends RelationalDataTable
>(
  builder: Builder,
  alias: Alias,
  source: (builder: Builder) => RelationalRowProvider<DataStoreType, RowType>
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
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
  TableType extends DataStoreType["tables"][TableName] = DataStoreType["tables"][TableName]
> = RelationalRowProvider<DataStoreType, RowType> & {
  tableName: TableName
  tableAlias?: keyof DataStoreType["tables"]

  select(
    column: STAR
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName],
    TableType
  >
  select<Column extends keyof TableType>(
    ...columns: Column[]
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    Pick<TableType, Column>,
    TableType
  >

  alias<Column extends keyof RowType & keyof TableType, Alias extends string>(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>,
    TableType
  >

  where(
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  ): TableNodeBuilder<DataStoreType, TableName, RowType, TableType>
}

class DefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = {},
  TableType extends DataStoreType["tables"][TableName] = DataStoreType["tables"][TableName]
> implements TableNodeBuilder<DataStoreType, TableName, RowType, TableType>
{
  asNode(): RelationalQueryNode<RelationalNodeType> {
    return {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.tableName,
      tableAlias: this.tableAlias,
      select: this.#select,
      where: this.#where,
      parent: this.#parent,
    } as TableQueryNode<DataStoreType, TableName, RowType>
  }

  tableName: TableName

  tableAlias?: keyof DataStoreType["tables"]
  #parent?: QueryNode
  #select?: SelectClause<TableType, keyof TableType, RowType>
  #where?: WhereClause<TableType>

  constructor(
    tableName: TableName,
    parent?: QueryNode,
    tableAlias?: keyof DataStoreType["tables"],
    select?: SelectClause<TableType, keyof TableType, RowType>,
    where?: WhereClause<TableType>
  ) {
    this.tableName = tableName
    this.tableAlias = tableAlias
    this.#parent = parent
    this.#select = select
    this.#where = where
  }

  select(
    column: STAR
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName],
    TableType
  >
  select<Column extends keyof TableType>(
    ...columns: Column[]
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    Pick<TableType, Column>,
    TableType
  >
  select<Column extends keyof DataStoreType["tables"][TableName]>(
    column?: unknown,
    ...rest: unknown[]
  ):
    | TableNodeBuilder<
        DataStoreType,
        TableName,
        DataStoreType["tables"][TableName],
        TableType
      >
    | TableNodeBuilder<
        DataStoreType,
        TableName,
        Pick<TableType, Column>,
        TableType
      > {
    if (column === "*") {
      return new DefaultTableNodeBuilder<
        DataStoreType,
        TableName,
        DataStoreType["tables"][TableName],
        TableType
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
      Pick<DataStoreType["tables"][TableName], Column>,
      TableType
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

  alias<Column extends keyof RowType & keyof TableType, Alias extends string>(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>,
    TableType
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
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  ): TableNodeBuilder<DataStoreType, TableName, RowType, TableType> {
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
  LeftRowType extends RelationalDataTable,
  RightRowType extends RelationalDataTable
> = RelationalRowProvider<
  DataStoreType,
  MergedNonOverlappingType<LeftRowType, RightRowType>
>

class DefaultJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  LeftTable extends keyof DataStoreType["tables"],
  RightTable extends keyof DataStoreType["tables"],
  LeftRowType extends RelationalDataTable,
  RightRowType extends RelationalDataTable
> implements JoinNodeBuilder<DataStoreType, LeftRowType, RightRowType>
{
  leftTable: TableQueryNode<DataStoreType, LeftTable, LeftRowType>
  rightTable: TableQueryNode<DataStoreType, RightTable, RightRowType>
  filter:
    | JoinColumnFilter<DataStoreType, LeftTable, RightTable>
    | JoinGroupFilter<DataStoreType, LeftTable, RightTable>

  constructor(
    leftTable: TableQueryNode<DataStoreType, LeftTable, LeftRowType>,
    rightTable: TableQueryNode<DataStoreType, RightTable, RightRowType>,
    filter:
      | JoinColumnFilter<DataStoreType, LeftTable, RightTable>
      | JoinGroupFilter<DataStoreType, LeftTable, RightTable>
  ) {
    this.leftTable = leftTable
    this.rightTable = rightTable
    this.filter = filter
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    const join: JoinQueryNode<
      DataStoreType,
      LeftTable,
      RightTable,
      LeftRowType,
      RightRowType
    > = {
      nodeType: RelationalNodeType.JOIN,
      left: this.leftTable,
      right: this.rightTable,
      filter: this.filter,
    }

    return join
  }

  build(
    ctor: QueryBuilderCtor<MergedNonOverlappingType<LeftRowType, RightRowType>>
  ): Query<MergedNonOverlappingType<LeftRowType, RightRowType>> {
    return new ctor(this.asNode()).build()
  }
}

type MultiJoinQueryNodeBuilder<
  DataStoreType extends RelationalDataStore,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable
> = RelationalRowProvider<DataStoreType, RowType> & {
  join<
    JoinTable extends Tables,
    Table extends keyof DataStoreType["tables"],
    TableRowType extends RelationalDataTable
  >(
    left: JoinTable,
    table: TableQueryNode<DataStoreType, Table, TableRowType>,
    filter:
      | JoinColumnFilter<DataStoreType, JoinTable, Table>
      | JoinGroupFilter<DataStoreType, JoinTable, Table>
  ): MultiJoinQueryNodeBuilder<
    DataStoreType,
    Tables | Table,
    MergedNonOverlappingType<RowType, TableRowType>
  >
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
  TableType extends RelationalDataTable,
  ContainingColumn extends ArrayProperty<TableType>,
  ColumnValue extends ArrayItemType<TableType, ContainingColumn>
>(
  column: ContainingColumn,
  ...values: ColumnValue[]
): FilterTypes<TableType> => {
  return {
    type: ContainmentObjectType.ARRAY,
    column,
    value: values.length === 1 ? values[0] : values,
    op: ColumnValueContainsOperation.IN,
  }
}

type BooleanFilter = <RowType>(
  ...clauses: (FilterGroup<RowType> | FilterTypes<RowType>)[]
) => FilterGroup<RowType>

type ColumnFilter = <
  RowType,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType
) => FilterTypes<RowType>

function ColumnGroupFilterBuilder<RowType>(
  op: BooleanOperation,
  ...clauses: (FilterGroup<RowType> | FilterTypes<RowType>)[]
): FilterGroup<RowType> {
  return {
    op,
    filters: clauses,
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
): FilterTypes<RowType> {
  return {
    column,
    value,
    op,
  }
}
