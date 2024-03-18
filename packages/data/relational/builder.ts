/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils"
import type { RelationalDataStore, RelationalDataTable, STAR } from "."
import type { Query } from "../query"
import { QueryBuilderBase } from "../query/builder"
import { QueryError } from "../query/error"
import {
  ContainmentObjectType,
  type ColumnAlias,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinClauseQueryNode,
  type JoinColumnFilter,
  type NamedRowGenerator,
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
  T extends RelationalDataTable,
> extends QueryBuilderBase<T> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }
}

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

  from<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName,
  ): TableNodeBuilder<DataStoreType, TableName>
}

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
 * Filter for rows where `column=value`
 *
 * @param column The column to use
 * @param value The value to use for the query
 * @returns A filter
 */
export const eq: ColumnFilterFn = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.EQ)
/**
 * Join for rows where `left.column=right.column``
 *
 * @param leftColumn The column to use for the left table comparison
 * @param rightColumn The column to use for the right table comparison
 * @returns A filter
 */
export const joinEq: JoinColumnFilterFn = (leftColumn, rightColumn) =>
  JoinColumnFilterBuilder(leftColumn, rightColumn, ColumnFilteringOperation.EQ)
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

/******************************************************************************
 * Internal implementation
 ******************************************************************************/

/**
 * Constructor type
 */
type QueryBuilderCtor<RowType extends RelationalDataTable> = new (
  node: RelationalQueryNode<RelationalNodeType>,
) => RelationalQueryBuilder<RowType>

/**
 * Represents a relational query that will return some value of {@link RowType}
 * from the given {@link DataStoreType}
 */
interface RelationalRowProvider<
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
  build(ctor: QueryBuilderCtor<RowType>): Query<RowType>
}

interface NamedRelationalRowProvider<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> extends RelationalRowProvider<
    RowType,
    NamedRowGenerator<DataStoreType, TableName>
  > {
  tableName: TableName
}

export function cte<
  DataStoreType extends RelationalDataStore,
  Alias extends string,
  RowType extends RelationalDataTable,
>(
  builder: RelationalNodeBuilder<DataStoreType>,
  alias: Alias,
  source: (
    builder: RelationalNodeBuilder<DataStoreType>,
  ) => RelationalRowProvider<RowType>,
): RelationalNodeBuilder<ModifiedStore<DataStoreType, Alias, RowType>> {
  // Get the row generator
  const generator = source(builder).asNode()

  const parent = generator.parent

  const cte: CteClause<ModifiedStore<DataStoreType, Alias, RowType>, Alias> = {
    tableName: alias,
    nodeType: RelationalNodeType.CTE,
    source: generator,
  }

  if (parent) {
    // Push this parent above...
    cte.parent = parent
    parent.children = [cte]
    cte.children = [generator]
    generator.parent = cte
  } else {
    cte.children = [generator]
    generator.parent = cte
  }

  return new DefaultRelationalNodeBuilder(cte, builder.tableAlias)
}

type TableAlias = Record<
  keyof RelationalDataStore["tables"],
  keyof RelationalDataStore["tables"]
>

export class DefaultRelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  RowType extends RelationalDataTable = never,
  Aliasing extends keyof DataStoreType["tables"] = never,
> implements RelationalNodeBuilder<DataStoreType, RowType, Aliasing>
{
  #context?: RelationalQueryNode<RelationalNodeType>
  #tableAlias: TableAlias = {}

  // Only all the context to transit to the next node in the chain
  get context(): RelationalQueryNode<RelationalNodeType> | undefined {
    const current = this.#context
    this.#context = undefined

    return current
  }

  get tableAlias(): TableAlias {
    return this.#tableAlias
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    throw new QueryError("No context exists on the current query builder")
  }

  constructor(
    context?: RelationalQueryNode<RelationalNodeType>,
    tableAlias: TableAlias = {},
  ) {
    this.#context = context
    this.#tableAlias = tableAlias
  }

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
  > {
    const a = Object.fromEntries([[alias, table as string]])
    return new DefaultRelationalNodeBuilder<
      ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
      RowType,
      Aliasing | Alias
    >(this.#context, {
      ...this.tableAlias,
      ...a,
    })
  }

  from<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName,
  ): TableNodeBuilder<
    DataStoreType,
    TableName,
    DataStoreType["tables"][TableName]
  > {
    const alias: keyof DataStoreType["tables"] | undefined =
      tableName in this.#tableAlias
        ? this.#tableAlias[tableName as string]
        : undefined

    return new DefaultTableNodeBuilder<
      DataStoreType,
      TableName,
      DataStoreType["tables"][TableName]
    >(tableName, alias, undefined, undefined, undefined, this.context)
  }

  build(_: QueryBuilderCtor<RowType>): Query<RowType> {
    throw new QueryError(
      "invalid to build a query from a RelationalQueryNodeBuilder",
    )
  }
}

type TableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> = NamedRelationalRowProvider<DataStoreType, TableName, RowType> & {
  tableName: TableName
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
    joinTable: NamedRelationalRowProvider<
      DataStoreType,
      JoinTable,
      JoinRowType
    >,
    filter: JoinColumnFilter<
      DataStoreType["tables"][TableName],
      DataStoreType["tables"][JoinTable]
    >,
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

class DefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> implements TableNodeBuilder<DataStoreType, TableName, RowType>
{
  tableName: TableName
  tableAlias?: keyof DataStoreType["tables"]

  #select?: SelectClause<
    DataStoreType,
    TableName,
    keyof DataStoreType["tables"][TableName]
  >
  #where?: WhereClause<DataStoreType["tables"][TableName]>
  #alias?: ColumnAlias<
    DataStoreType["tables"][TableName],
    keyof DataStoreType["tables"][TableName],
    string
  >[]
  #parent?: RelationalQueryNode<RelationalNodeType>

  asNode(): NamedRowGenerator<DataStoreType, TableName> {
    const select = this.#select ?? {
      nodeType: RelationalNodeType.SELECT,
      columns: [],
    }

    const where = this.#where

    const aliasing = this.#alias

    const node = {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.tableName,
      alias: this.tableAlias,
    } as TableQueryNode<DataStoreType, TableName>

    select.parent = node
    node.children = [select]
    if (where) {
      where.parent = node
      node.children.push(where)
    }

    if (aliasing) {
      aliasing.forEach((a) => {
        a.parent = node
        node.children?.push(a)
      })
    }

    if (node.parent) {
      if (node.parent.children) {
        node.parent.children.push(node)
      } else {
        node.parent.children = [node]
      }
    }

    if (this.#parent) {
      node.parent = this.#parent
      if (this.#parent.children) {
        this.#parent.children.push(node)
      } else {
        this.#parent.children = [node]
      }
    }

    return node
  }

  constructor(
    tableName: TableName,
    tableAlias?: keyof DataStoreType["tables"],
    select?: SelectClause<
      DataStoreType,
      TableName,
      keyof DataStoreType["tables"][TableName]
    >,
    where?: WhereClause<DataStoreType["tables"][TableName]>,
    alias?: ColumnAlias<
      DataStoreType["tables"][TableName],
      keyof DataStoreType["tables"][TableName],
      string
    >[],
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.tableName = tableName
    ;(this.tableAlias = tableAlias), (this.#select = select)
    this.#where = where
    this.#alias = alias
    this.#parent = parent
  }

  join<
    JoinTable extends keyof DataStoreType["tables"],
    JoinRowType extends RelationalDataTable,
  >(
    joinTable: NamedRelationalRowProvider<
      DataStoreType,
      JoinTable,
      JoinRowType
    >,
    filter: JoinColumnFilter<
      DataStoreType["tables"][TableName],
      DataStoreType["tables"][JoinTable]
    >,
    type: JoinType = JoinType.INNER,
  ): JoinNodeBuilder<
    DataStoreType,
    TableName | JoinTable,
    MergedNonOverlappingType<RowType, JoinRowType>
  > {
    const parent = this.#parent
    this.#parent = undefined
    return new SingleJoinNodeBuilder(this, joinTable, filter, type, parent)
  }

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
  select<Column extends keyof DataStoreType["tables"][TableName]>(
    column?: unknown,
    ...rest: unknown[]
  ):
    | Omit<
        TableNodeBuilder<
          DataStoreType,
          TableName,
          DataStoreType["tables"][TableName]
        >,
        "select"
      >
    | Omit<
        TableNodeBuilder<
          DataStoreType,
          TableName,
          Pick<DataStoreType["tables"][TableName], Column>
        >,
        "select"
      > {
    if (column === "*") {
      return new DefaultTableNodeBuilder<
        DataStoreType,
        TableName,
        DataStoreType["tables"][TableName]
      >(
        this.tableName,
        this.tableAlias,
        {
          nodeType: RelationalNodeType.SELECT,
          columns: column,
        },
        this.#where,
        this.#alias,
        this.#parent,
      )
    }

    return new DefaultTableNodeBuilder<
      DataStoreType,
      TableName,
      Pick<DataStoreType["tables"][TableName], Column>
    >(
      this.tableName,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: [column as Column].concat(rest as Column[]),
      },
      this.#where,
      this.#alias,
      this.#parent,
    )
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.asNode()).build()
  }

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
  > {
    const aliasing = this.#alias ?? []
    aliasing.push({ nodeType: RelationalNodeType.ALIAS, column, alias })
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: this.#select?.columns ?? [],
      },
      this.#where,
      aliasing,
      this.#parent,
    )
  }

  where(
    filter:
      | FilterGroup<DataStoreType["tables"][TableName]>
      | FilterTypes<DataStoreType["tables"][TableName]>,
  ): Omit<TableNodeBuilder<DataStoreType, TableName, RowType>, "where"> {
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.tableAlias,
      this.#select,
      {
        nodeType: RelationalNodeType.WHERE,
        filter,
      },
      this.#alias,
      this.#parent,
    )
  }
}

type JoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> = RelationalRowProvider<RowType> & {
  join<
    JoinTarget extends Tables,
    JoinTable extends keyof Exclude<DataStoreType["tables"], Tables> & string,
    TableType extends RelationalDataTable,
  >(
    target: JoinTarget,
    source: NamedRelationalRowProvider<DataStoreType, JoinTable, TableType>,
    filter: JoinColumnFilter<
      DataStoreType["tables"][JoinTarget],
      DataStoreType["tables"][JoinTable]
    >,
  ): JoinNodeBuilder<
    DataStoreType,
    Tables | JoinTable,
    MergedNonOverlappingType<RowType, TableType>
  >
}

class MultiJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> implements JoinNodeBuilder<DataStoreType, Tables, RowType>
{
  tables: NamedRowGenerator<DataStoreType, keyof DataStoreType["tables"]>[]
  filters: JoinClauseQueryNode<DataStoreType, Tables, Tables>[]
  parent?: RelationalQueryNode<RelationalNodeType>

  constructor(
    tables: NamedRowGenerator<DataStoreType, Tables>[],
    filters: JoinClauseQueryNode<DataStoreType, Tables, Tables>[],
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.tables = tables
    this.filters = filters
    this.parent = parent
  }

  join<
    JoinTarget extends Tables,
    JoinTable extends keyof Exclude<DataStoreType["tables"], Tables> & string,
    TableType extends RelationalDataTable,
  >(
    _target: JoinTarget,
    _source: NamedRelationalRowProvider<
      DataStoreType,
      JoinTable,
      RelationalDataTable
    >,
    _filter: JoinColumnFilter<
      DataStoreType["tables"][JoinTarget],
      DataStoreType["tables"][JoinTable]
    >,
  ): JoinNodeBuilder<
    DataStoreType,
    Tables | JoinTable,
    MergedNonOverlappingType<RowType, TableType>
  > {
    throw new Error("no")
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    const join: RelationalQueryNode<RelationalNodeType.JOIN> = {
      parent: this.parent,
      nodeType: RelationalNodeType.JOIN,
    }

    if (join.parent) {
      if (join.parent.children) {
        join.parent.children?.push(join)
      } else {
        join.parent.children = [join]
      }
    }

    for (const table of this.tables) {
      table.parent = join
    }

    join.children = [...this.tables]
    join.children.push(...this.filters)

    return join
  }

  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.asNode()).build()
  }
}

class SingleJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  LeftTable extends keyof DataStoreType["tables"],
  RightTable extends keyof DataStoreType["tables"],
  LeftType extends RelationalDataTable,
  RightType extends RelationalDataTable,
> implements
    JoinNodeBuilder<
      DataStoreType,
      LeftTable | RightTable,
      MergedNonOverlappingType<LeftType, RightType>
    >
{
  readonly leftSource: NamedRowGenerator<DataStoreType, LeftTable>
  readonly rightSource: NamedRowGenerator<DataStoreType, RightTable>
  readonly parent?: RelationalQueryNode<RelationalNodeType>

  readonly filter: JoinClauseQueryNode<DataStoreType, LeftTable, RightTable>

  readonly joinType: JoinType

  constructor(
    leftSource: NamedRelationalRowProvider<DataStoreType, LeftTable, LeftType>,
    rightSource: NamedRelationalRowProvider<
      DataStoreType,
      RightTable,
      RightType
    >,
    filter: JoinColumnFilter<
      DataStoreType["tables"][LeftTable],
      DataStoreType["tables"][RightTable],
      keyof DataStoreType["tables"][LeftTable],
      MatchingProperty<
        DataStoreType["tables"][LeftTable],
        DataStoreType["tables"][RightTable],
        keyof DataStoreType["tables"][LeftTable]
      >
    >,
    joinType: JoinType,
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.leftSource = leftSource.asNode()
    this.rightSource = rightSource.asNode()
    this.filter = {
      nodeType: RelationalNodeType.ON,
      filter,
      type: joinType,
      left: this.leftSource.tableName,
      right: this.rightSource.tableName,
    }
    this.joinType = joinType
    this.parent = parent
  }

  join<
    JoinTarget extends LeftTable | RightTable,
    JoinTable extends keyof Exclude<
      DataStoreType["tables"],
      LeftTable | RightTable
    > &
      string,
    TableType extends RelationalDataTable,
  >(
    target: JoinTarget,
    source: NamedRelationalRowProvider<DataStoreType, JoinTable, TableType>,
    filter: JoinColumnFilter<
      DataStoreType["tables"][JoinTarget],
      DataStoreType["tables"][JoinTable]
    >,
  ): JoinNodeBuilder<
    DataStoreType,
    LeftTable | RightTable | JoinTable,
    MergedNonOverlappingType<
      MergedNonOverlappingType<LeftType, RightType>,
      TableType
    >
  > {
    const f = this.filter.filter

    return new MultiJoinNodeBuilder<
      DataStoreType,
      LeftTable | RightTable | JoinTable,
      MergedNonOverlappingType<
        MergedNonOverlappingType<LeftType, RightType>,
        TableType
      >
    >(
      [
        this.leftSource,
        this.rightSource,
        source.asNode() as NamedRowGenerator<
          DataStoreType,
          LeftTable | RightTable | JoinTable
        >,
      ],
      [
        {
          nodeType: RelationalNodeType.ON,
          filter: {
            leftColumn: f.leftColumn as keyof DataStoreType["tables"][
              | LeftTable
              | RightTable
              | JoinTable],
            rightColumn: f.rightColumn as keyof DataStoreType["tables"][
              | LeftTable
              | RightTable
              | JoinTable],
            op: this.filter.filter.op,
          },
          type: this.filter.type,
          left: this.filter.left,
          right: this.filter.right,
        },
        {
          nodeType: RelationalNodeType.ON,
          filter: {
            leftColumn: filter.leftColumn as keyof DataStoreType["tables"][
              | LeftTable
              | RightTable
              | JoinTable],
            rightColumn: filter.rightColumn as keyof DataStoreType["tables"][
              | LeftTable
              | RightTable
              | JoinTable],
            op: filter.op,
          },
          type: JoinType.INNER,
          left: target,
          right: source.tableName,
        },
      ],
      this.parent,
    )
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    const join: RelationalQueryNode<RelationalNodeType.JOIN> = {
      parent: this.parent,
      nodeType: RelationalNodeType.JOIN,
    }

    if (join.parent) {
      if (join.parent.children) {
        join.parent.children?.push(join)
      } else {
        join.parent.children = [join]
      }
    }

    const left = this.leftSource
    const right = this.rightSource

    left.parent = join
    right.parent = join

    join.children = [left, right]
    this.filter.parent = join
    join.children.push(this.filter)

    return join
  }

  build(
    ctor: QueryBuilderCtor<MergedNonOverlappingType<LeftType, RightType>>,
  ): Query<MergedNonOverlappingType<LeftType, RightType>> {
    return new ctor(this.asNode()).build()
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

type JoinColumnFilterFn = <
  LeftType extends RelationalDataTable,
  RightType extends RelationalDataTable,
  LeftColumn extends keyof LeftType,
  RightColumn extends MatchingProperty<LeftType, RightType, LeftColumn>,
>(
  leftColumn: LeftColumn,
  rightColumn: RightColumn,
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
  RightColumn extends MatchingProperty<LeftType, RightType, LeftColumn>,
>(
  leftColumn: LeftColumn,
  rightColumn: RightColumn,
  op: ColumnFilteringOperation,
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
