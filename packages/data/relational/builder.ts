/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable } from "."
import type { Query } from "../query"
import type { QueryNode } from "../query/ast"
import { QueryBuilderBase } from "../query/builder"
import { QueryError } from "../query/error"
import {
  ContainmentObjectType,
  isTableQueryNode,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
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
export type RelationalDataSource<
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
> = RelationalDataSource<DataStoreType, RowType> &
  //CteNodeBuilder<DataStoreType> &
  FromNodeBuilder<DataStoreType> & {
    projections: Map<string, QueryNode>
  }

export function useDataStore<
  DataStoreType extends RelationalDataStore
>(): RelationalNodeBuilder<DataStoreType> {
  return new DefaultRelationalNodeBuilder()
}

export function cte<
  DataStoreType extends RelationalDataStore,
  Alias extends string,
  Builder extends RelationalNodeBuilder<DataStoreType>,
  RowType extends RelationalDataTable
>(
  builder: Builder,
  alias: Alias,
  source: (
    builder: Builder
  ) => TableNodeBuilder<DataStoreType, keyof DataStoreType["tables"], RowType>
): RelationalNodeBuilder<ModifiedStore<DataStoreType, Alias, RowType>> {
  const table = source(builder)

  const projections = builder.projections.set(alias, {
    tableName: alias,
    nodeType: RelationalNodeType.CTE,
    source: table.asNode() as TableQueryNode<
      DataStoreType,
      keyof DataStoreType["tables"]
    >,
  } as CteClause<DataStoreType, keyof DataStoreType["tables"]>)
  return new DefaultRelationalNodeBuilder(builder.projections)
}

type FromNodeBuilder<DataStoreType extends RelationalDataStore> = {
  from<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName
  ): TableNodeBuilder<DataStoreType, TableName>

  from<TableName extends keyof DataStoreType["tables"], Alias extends string>(
    tableName: TableName,
    tableAlias: Alias
  ): TableNodeBuilder<
    ModifiedStore<
      DataStoreType,
      Extract<TableName, string>,
      DataStoreType["tables"][TableName]
    >,
    TableName,
    DataStoreType["tables"][TableName],
    Alias
  >
}

type CteNodeBuilder<DataStoreType extends RelationalDataStore> = {
  with<TableAlias extends string, TableRowType extends RelationalDataTable>(
    tableName: TableAlias,
    source: TableNodeBuilder<
      DataStoreType,
      keyof DataStoreType["tables"],
      TableRowType
    >
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, TableAlias, TableRowType>
  >
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
  >
  from<TableName extends keyof DataStoreType["tables"], Alias extends string>(
    tableName: TableName,
    tableAlias: Alias
  ): TableNodeBuilder<
    ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
    TableName,
    DataStoreType["tables"][TableName],
    Alias
  >
  from<
    TableName extends keyof DataStoreType["tables"],
    Alias extends string = never
  >(
    tableName: TableName,
    tableAlias?: Alias
  ):
    | TableNodeBuilder<
        DataStoreType,
        TableName,
        DataStoreType["tables"][TableName]
      >
    | TableNodeBuilder<
        ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
        TableName,
        DataStoreType["tables"][TableName],
        Alias
      > {
    if (tableAlias !== undefined) {
      return new DefaultTableNodeBuilder<
        ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
        TableName,
        DataStoreType["tables"][TableName],
        Alias
      >(tableName, this.projections.get(tableName as string), tableAlias)
    }

    return new DefaultTableNodeBuilder<
      DataStoreType,
      TableName,
      DataStoreType["tables"][TableName]
    >(tableName, this.projections.get(tableName as string))
  }

  with<TableAlias extends string, TableRowType extends RelationalDataTable>(
    tableName: TableAlias,
    source: TableNodeBuilder<
      DataStoreType,
      keyof DataStoreType["tables"],
      TableRowType
    >
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, TableAlias, TableRowType>
  > {
    const node = source.asNode()
    if (isTableQueryNode(node)) {
      // Nodes may be built from projections
      node.parent = node.parent ?? this.projections.get(node.tableName)

      this.projections.set(tableName, {
        nodeType: RelationalNodeType.CTE,
        tableName,
        source: node,
      } as CteClause<ModifiedStore<DataStoreType, TableAlias, TableRowType>, TableAlias>)

      return new DefaultRelationalNodeBuilder<
        ModifiedStore<DataStoreType, TableAlias, TableRowType>,
        never
      >(this.projections)
    }

    throw new QueryError("cannot build CTE from non table source")
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    throw new QueryError(
      "invalid to build a query without a valid table clause"
    )
  }
}

export type TableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
  TableAlias extends string = never,
  TableType extends DataStoreType["tables"][TableName] = DataStoreType["tables"][TableName]
> = RelationalDataSource<DataStoreType, RowType> & {
  tableName: TableName

  select<Column extends keyof TableType>(
    ...columns: Column[]
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    Pick<TableType, Column>,
    TableAlias,
    TableType
  >

  alias<Column extends keyof RowType & keyof TableType, Alias extends string>(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>,
    TableAlias,
    TableType
  >

  where(
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  ): TableNodeBuilder<DataStoreType, TableName, RowType, TableAlias, TableType>
}

class DefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
  TableAlias extends string = never,
  TableType extends DataStoreType["tables"][TableName] = DataStoreType["tables"][TableName]
> implements
    TableNodeBuilder<DataStoreType, TableName, RowType, TableAlias, TableType>
{
  asNode(): RelationalQueryNode<RelationalNodeType> {
    return {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.tableName,
      tableAlias: this.#tableAlias,
      select: this.#select,
      where: this.#where,
      parent: this.#parent,
    } as TableQueryNode<DataStoreType, TableName, RowType, TableAlias>
  }

  tableName: TableName

  #tableAlias?: TableAlias
  #parent?: QueryNode
  #select?: SelectClause<TableType, keyof TableType, RowType>
  #where?: WhereClause<TableType>

  constructor(
    tableName: TableName,
    parent?: QueryNode,
    tableAlias?: TableAlias,
    select?: SelectClause<TableType, keyof TableType, RowType>,
    where?: WhereClause<TableType>
  ) {
    this.tableName = tableName
    this.#tableAlias = tableAlias
    this.#parent = parent
    this.#select = select
    this.#where = where
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.asNode()).build()
  }

  select<Column extends keyof TableType>(
    ...columns: Column[]
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    Pick<TableType, Column>,
    TableAlias,
    TableType
  > {
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.#parent,
      this.#tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: columns,
      },
      this.#where
    )
  }

  alias<Column extends keyof RowType & keyof TableType, Alias extends string>(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>,
    TableAlias,
    TableType
  > {
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.#parent,
      this.#tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: this.#select?.columns ?? [],
        aliasing: (this.#select?.aliasing ?? []).concat([{ column, alias }]),
      },
      this.#where
    )
  }

  where(
    filter: FilterGroup<TableType> | FilterTypes<TableType>
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    RowType,
    TableAlias,
    TableType
  > {
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.#parent,
      this.#tableAlias,
      this.#select,
      {
        nodeType: RelationalNodeType.WHERE,
        filter,
      }
    )
  }
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
