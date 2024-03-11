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
  isTableQueryNode,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type RelationalQueryNode,
  type TableQueryNode,
} from "./ast"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ContainmentItemType,
  type ContainmentProperty,
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
  CteNodeBuilder<DataStoreType> &
  FromNodeBuilder<DataStoreType>

type TableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
  TableAlias extends keyof DataStoreType["tables"] = never
> = RelationalDataSource<DataStoreType, RowType> & {
  select<Column extends keyof DataStoreType["tables"][TableName] & string>(
    ...columns: Column[]
  ): Omit<
    TableNodeBuilder<
      DataStoreType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>,
      TableAlias
    >,
    "select"
  >

  alias<
    Column extends keyof RowType &
      keyof DataStoreType["tables"][TableName] &
      string,
    Alias extends string
  >(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>,
    TableAlias
  >

  where(
    filter:
      | FilterGroup<DataStoreType["tables"][TableName]>
      | FilterTypes<DataStoreType["tables"][TableName]>
  ): Omit<
    TableNodeBuilder<DataStoreType, TableName, RowType, TableAlias>,
    "where"
  >
}

export function useDataStore<
  DataStoreType extends RelationalDataStore
>(): RelationalNodeBuilder<DataStoreType> {
  return new DefaultRelationalNodeBuilder()
}

export class DefaultRelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable = never
> implements RelationalNodeBuilder<DataStoreType, RowType>
{
  #projections: Map<string, QueryNode>

  asNode(): RelationalQueryNode<RelationalNodeType> {
    throw new QueryError("cannot translate a RelationalNodeBuilder directly")
  }

  constructor(projections?: Map<string, QueryNode>) {
    this.#projections = projections ?? new Map()
  }

  from<TableName extends keyof DataStoreType["tables"] & string>(
    tableName: TableName
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName]
  >
  from<
    TableName extends keyof DataStoreType["tables"] & string,
    Alias extends string
  >(
    tableName: TableName,
    tableAlias: Alias
  ): TableNodeBuilder<
    ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
    TableName,
    DataStoreType["tables"][TableName],
    Alias
  >
  from<
    TableName extends keyof DataStoreType["tables"] & string,
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
      >(tableName, {
        parent: this.#projections.get(tableName),
        nodeType: RelationalNodeType.TABLE,
        tableName,
        tableAlias: tableAlias,
      })
    }

    return new DefaultTableNodeBuilder<
      DataStoreType,
      TableName,
      DataStoreType["tables"][TableName]
    >(tableName, {
      parent: this.#projections.get(tableName),
      nodeType: RelationalNodeType.TABLE,
      tableName,
    })
  }

  with<TableName extends string, TableRowType extends RelationalDataTable>(
    tableName: TableName,
    source: RelationalDataSource<DataStoreType, TableRowType>
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, TableName, TableRowType>,
    never
  > {
    const node = source.asNode()
    if (isTableQueryNode(node)) {
      // Nodes may be built from projections
      node.parent = node.parent ?? this.#projections.get(node.tableName)

      this.#projections.set(tableName, {
        nodeType: RelationalNodeType.CTE,
        tableName,
        source: node,
      } as CteClause<ModifiedStore<DataStoreType, TableName, TableRowType>, TableName>)

      return new DefaultRelationalNodeBuilder(this.#projections)
    }

    throw new QueryError("cannot build CTE from non table source")
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    throw new QueryError(
      "invalid to build a query without a valid table clause"
    )
  }
}

class DefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"] & string,
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
  TableAlias extends keyof DataStoreType["tables"] & string = never
> implements TableNodeBuilder<DataStoreType, TableName, RowType>
{
  #node: TableQueryNode<DataStoreType, TableName, RowType, TableAlias>

  asNode(): RelationalQueryNode<RelationalNodeType> {
    return this.#node
  }

  constructor(
    tableName: TableName,
    node?: TableQueryNode<DataStoreType, TableName, RowType, TableAlias>
  ) {
    this.#node = node ?? {
      tableName: tableName,
      nodeType: RelationalNodeType.TABLE,
    }
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.#node).build()
  }

  select<Column extends keyof DataStoreType["tables"][TableName] & string>(
    ...columns: Column[]
  ): Omit<
    TableNodeBuilder<
      DataStoreType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>,
      TableAlias
    >,
    "select"
  > {
    return new DefaultTableNodeBuilder(this.#node.tableName, {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.#node.tableName,
      tableAlias: this.#node.tableAlias,
      parent: this.#node.parent,
      select: {
        nodeType: RelationalNodeType.SELECT,
        columns: columns,
      },
      where: this.#node.where,
    })
  }

  alias<
    Column extends keyof RowType &
      keyof DataStoreType["tables"][TableName] &
      string,
    Alias extends string
  >(
    column: Column,
    alias: Alias
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    AliasedType<RowType, Column, Alias>,
    TableAlias
  > {
    return new DefaultTableNodeBuilder(this.#node.tableName, {
      nodeType: RelationalNodeType.TABLE,
      tableAlias: this.#node.tableAlias,
      tableName: this.#node.tableName,
      parent: this.#node.parent,
      select: {
        nodeType: RelationalNodeType.SELECT,
        columns: this.#node.select?.columns ?? [],
        aliasing: (this.#node.select?.aliasing ?? []).concat([
          { column, alias },
        ]),
      },
    })
  }

  where(
    filter:
      | FilterGroup<DataStoreType["tables"][TableName]>
      | FilterTypes<DataStoreType["tables"][TableName]>
  ): Omit<
    TableNodeBuilder<DataStoreType, TableName, RowType, TableAlias>,
    "where"
  > {
    return new DefaultTableNodeBuilder(this.#node.tableName, {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.#node.tableName,
      tableAlias: this.#node.tableAlias,
      select: this.#node.select,
      parent: this.#node.parent,
      where: {
        nodeType: RelationalNodeType.WHERE,
        filter,
      },
    })
  }
}

type FromNodeBuilder<DataStoreType extends RelationalDataStore> = {
  from<TableName extends keyof DataStoreType["tables"] & string>(
    tableName: TableName
  ): TableNodeBuilder<DataStoreType, TableName>

  from<
    TableName extends keyof DataStoreType["tables"] & string,
    Alias extends string
  >(
    tableName: TableName,
    tableAlias: Alias
  ): TableNodeBuilder<
    ModifiedStore<DataStoreType, TableName, DataStoreType["tables"][TableName]>,
    TableName,
    DataStoreType["tables"][TableName],
    Alias
  >
}

type CteNodeBuilder<DataStoreType extends RelationalDataStore> = {
  with<TableName extends string, TableRowType extends RelationalDataTable>(
    tableName: TableName,
    source: RelationalDataSource<DataStoreType, TableRowType>
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, TableName, TableRowType>
  >
}

export function from<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"] & string
>(tableName: TableName): TableNodeBuilder<DataStoreType, TableName> {
  return new DefaultTableNodeBuilder(tableName)
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
): FilterTypes<RowType> => {
  return {
    column,
    value,
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
