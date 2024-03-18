import type { AliasedType } from "@telefrek/core/type/utils"
import { QueryError } from "../../query/error"
import type { ExecutionMode, Query } from "../../query/index"
import type {
  ColumnAlias,
  CteClause,
  FilterGroup,
  FilterTypes,
  JoinClauseQueryNode,
  JoinColumnFilter,
  NamedRowGenerator,
  RelationalQueryNode,
  SelectClause,
  TableQueryNode,
  WhereClause,
} from "../ast"
import type { RelationalDataStore, RelationalDataTable, STAR } from "../index"
import {
  ColumnFilteringOperation,
  JoinType,
  RelationalNodeType,
  type MergedNonOverlappingType,
  type ModifiedStore,
} from "../types"
import {
  RelationalNodeBuilder,
  type JoinNodeBuilder,
  type NamedRelationalRowProvider,
  type QueryBuilderCtor,
  type RowProviderBuilder,
  type TableAlias,
  type TableGenerator,
  type TableNodeBuilder,
} from "./index"

/******************************************************************************
 * Internal implementation
 ******************************************************************************/

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

  withCte<Alias extends string, TableType extends RelationalDataTable>(
    alias: Alias,
    source: RowProviderBuilder<DataStoreType, RowType, Aliasing, TableType>,
  ): RelationalNodeBuilder<
    ModifiedStore<DataStoreType, Alias, TableType>,
    RowType,
    Aliasing
  > {
    // Get the row generator
    const generator = source(this).asNode()

    const parent = generator.parent

    const cte: CteClause = {
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

    return new DefaultRelationalNodeBuilder(cte, this.tableAlias)
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
    >(
      tableName,
      this as RelationalNodeBuilder<DataStoreType>,
      alias,
      undefined,
      undefined,
      undefined,
      this.context,
    )
  }

  build(_: QueryBuilderCtor<RowType>): Query<RowType> {
    throw new QueryError(
      "invalid to build a query from a RelationalQueryNodeBuilder",
    )
  }
}

class DefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> implements TableNodeBuilder<DataStoreType, TableName, RowType>
{
  tableName: TableName
  builder: RelationalNodeBuilder<DataStoreType>
  tableAlias?: keyof DataStoreType["tables"]

  #select?: SelectClause
  #where?: WhereClause<DataStoreType["tables"][TableName]>
  #alias?: ColumnAlias<
    DataStoreType["tables"][TableName],
    keyof DataStoreType["tables"][TableName],
    string
  >[]
  #parent?: RelationalQueryNode<RelationalNodeType>

  asNode(): NamedRowGenerator {
    const select = this.#select ?? {
      nodeType: RelationalNodeType.SELECT,
      columns: [],
    }

    const where = this.#where

    const aliasing = this.#alias

    const node: TableQueryNode = {
      nodeType: RelationalNodeType.TABLE,
      tableName: this.tableName as string,
      alias: this.tableAlias as string,
    }

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
    builder: RelationalNodeBuilder<DataStoreType>,
    tableAlias?: keyof DataStoreType["tables"],
    select?: SelectClause,
    where?: WhereClause<DataStoreType["tables"][TableName]>,
    alias?: ColumnAlias<
      DataStoreType["tables"][TableName],
      keyof DataStoreType["tables"][TableName],
      string
    >[],
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.tableAlias = tableAlias
    this.#select = select
    this.#where = where
    this.#alias = alias
    this.#parent = parent
  }

  join<
    JoinTable extends keyof DataStoreType["tables"],
    JoinRowType extends RelationalDataTable,
  >(
    joinTable: JoinTable,
    tableGenerator: TableGenerator<DataStoreType, JoinTable, JoinRowType>,
    leftColumn: keyof DataStoreType["tables"][TableName],
    rightColumn: keyof DataStoreType["tables"][JoinTable],
    type: JoinType = JoinType.INNER,
  ): JoinNodeBuilder<
    DataStoreType,
    TableName | JoinTable,
    MergedNonOverlappingType<RowType, JoinRowType>
  > {
    const parent = this.#parent
    this.#parent = undefined
    return new SingleJoinNodeBuilder(
      this.builder,
      this,
      tableGenerator(this.builder.from(joinTable)),
      {
        leftColumn: leftColumn as string,
        rightColumn: rightColumn as string,
        op: ColumnFilteringOperation.EQ,
      },
      type,
      parent,
    )
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
        this.builder,
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
      this.builder,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: [column as string].concat(rest as string[]),
      },
      this.#where,
      this.#alias,
      this.#parent,
    )
  }

  build(
    ctor: QueryBuilderCtor<RowType>,
    name: string,
    mode?: ExecutionMode,
  ): Query<RowType> {
    return new ctor(this.asNode()).build(name, mode)
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
      this.builder,
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
      this.builder,
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

class MultiJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> implements JoinNodeBuilder<DataStoreType, Tables, RowType>
{
  tables: NamedRowGenerator[]
  filters: JoinClauseQueryNode[]
  parent?: RelationalQueryNode<RelationalNodeType>

  constructor(
    tables: NamedRowGenerator[],
    filters: JoinClauseQueryNode[],
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
    _joinTable: JoinTable,
    _tableGenerator: TableGenerator<DataStoreType, JoinTable, TableType>,
    _leftColumn: keyof DataStoreType["tables"][JoinTarget],
    _rightColumn: keyof DataStoreType["tables"][JoinTable],
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

  build(
    ctor: QueryBuilderCtor<RowType>,
    name: string,
    mode?: ExecutionMode,
  ): Query<RowType> {
    return new ctor(this.asNode()).build(name, mode)
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
  readonly leftSource: NamedRowGenerator
  readonly rightSource: NamedRowGenerator
  readonly parent?: RelationalQueryNode<RelationalNodeType>

  readonly filter: JoinClauseQueryNode
  readonly builder: RelationalNodeBuilder<DataStoreType>

  readonly joinType: JoinType

  constructor(
    builder: RelationalNodeBuilder<DataStoreType>,
    leftSource: NamedRelationalRowProvider<DataStoreType, LeftTable, LeftType>,
    rightSource: NamedRelationalRowProvider<
      DataStoreType,
      RightTable,
      RightType
    >,
    filter: JoinColumnFilter,
    joinType: JoinType,
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.builder = builder
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
    joinTable: JoinTable,
    tableGenerator: TableGenerator<DataStoreType, JoinTable, TableType>,
    leftColumn: keyof DataStoreType["tables"][JoinTarget],
    rightColumn: keyof DataStoreType["tables"][JoinTable],
  ): JoinNodeBuilder<
    DataStoreType,
    LeftTable | RightTable | JoinTable,
    MergedNonOverlappingType<
      MergedNonOverlappingType<LeftType, RightType>,
      TableType
    >
  > {
    const f = this.filter.filter

    const source = tableGenerator(this.builder.from(joinTable))

    return new MultiJoinNodeBuilder<
      DataStoreType,
      LeftTable | RightTable | JoinTable,
      MergedNonOverlappingType<
        MergedNonOverlappingType<LeftType, RightType>,
        TableType
      >
    >(
      [this.leftSource, this.rightSource, source.asNode()],
      [
        {
          nodeType: RelationalNodeType.ON,
          filter: {
            leftColumn: f.leftColumn,
            rightColumn: f.rightColumn,
            op: this.filter.filter.op,
          },
          type: this.filter.type,
          left: this.filter.left,
          right: this.filter.right,
        },
        {
          nodeType: RelationalNodeType.ON,
          filter: {
            leftColumn: leftColumn as string,
            rightColumn: rightColumn as string,
            op: ColumnFilteringOperation.EQ,
          },
          type: JoinType.INNER,
          left: target as string,
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
    name: string,
    mode?: ExecutionMode,
  ): Query<MergedNonOverlappingType<LeftType, RightType>> {
    return new ctor(this.asNode()).build(name, mode)
  }
}
