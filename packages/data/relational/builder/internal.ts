import type { AliasedType } from "@telefrek/core/type/utils"
import { QueryError } from "../../query/error"
import type {
  ExecutionMode,
  ParameterizedQuery,
  Query,
} from "../../query/index"
import {
  ContainmentObjectType,
  isFilterable,
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
} from "../ast"
import type {
  QueryParameters,
  RelationalDataStore,
  RelationalDataTable,
  STAR,
} from "../index"
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
  type PropertyOfType,
  type TableAlias,
} from "../types"
import {
  RelationalNodeBuilder,
  type JoinNodeBuilder,
  type NamedRelationalRowProvider,
  type ParameterizedJoinNodeBuilder,
  type ParameterizedNamedRelationalRowProvider,
  type ParameterizedQueryBuilderCtor,
  type ParameterizedRelationalNodeBuilder,
  type ParameterizedRowProviderBuilder,
  type ParameterizedTableGenerator,
  type ParameterizedTableNodeBuilder,
  type ParameterizedWhereBuilder,
  type ParameterizedWhereComposer,
  type QueryBuilderCtor,
  type RowProviderBuilder,
  type TableGenerator,
  type TableNodeBuilder,
  type WhereBuilder,
  type WhereComposer,
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

  select<TableName extends keyof DataStoreType["tables"]>(
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

export class DefaultParameterizedRelationalNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  RowType extends RelationalDataTable = never,
  Aliasing extends keyof DataStoreType["tables"] = never,
> implements
    ParameterizedRelationalNodeBuilder<
      DataStoreType,
      ParameterType,
      RowType,
      Aliasing
    >
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

    return new DefaultParameterizedRelationalNodeBuilder(cte, this.tableAlias)
  }

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
  > {
    const a = Object.fromEntries([[alias, table as string]])
    return new DefaultParameterizedRelationalNodeBuilder<
      ModifiedStore<DataStoreType, Alias, DataStoreType["tables"][TableName]>,
      ParameterType,
      RowType,
      Aliasing | Alias
    >(this.#context, {
      ...this.tableAlias,
      ...a,
    })
  }

  select<TableName extends keyof DataStoreType["tables"]>(
    tableName: TableName,
  ): ParameterizedTableNodeBuilder<
    DataStoreType,
    ParameterType,
    TableName,
    DataStoreType["tables"][TableName]
  > {
    const alias: keyof DataStoreType["tables"] | undefined =
      tableName in this.#tableAlias
        ? this.#tableAlias[tableName as string]
        : undefined

    return new ParameterizedDefaultTableNodeBuilder<
      DataStoreType,
      ParameterType,
      TableName,
      DataStoreType["tables"][TableName]
    >(
      tableName,
      this as ParameterizedRelationalNodeBuilder<DataStoreType, ParameterType>,
      alias,
      undefined,
      undefined,
      undefined,
      this.context,
    )
  }

  build(
    _: ParameterizedQueryBuilderCtor<RowType, ParameterType>,
  ): ParameterizedQuery<RowType, ParameterType> {
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

  private selectClause?: SelectClause
  private whereClause?: WhereClause<DataStoreType["tables"][TableName]>
  private columnAlias?: ColumnAlias<
    DataStoreType["tables"][TableName],
    keyof DataStoreType["tables"][TableName],
    string
  >[]
  private parent?: RelationalQueryNode<RelationalNodeType>

  constructor(
    tableName: TableName,
    builder: RelationalNodeBuilder<DataStoreType>,
    tableAlias?: keyof DataStoreType["tables"],
    selectClause?: SelectClause,
    whereClause?: WhereClause<DataStoreType["tables"][TableName]>,
    columnAlias?: ColumnAlias<
      DataStoreType["tables"][TableName],
      keyof DataStoreType["tables"][TableName],
      string
    >[],
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.tableAlias = tableAlias
    this.selectClause = selectClause
    this.whereClause = whereClause
    this.columnAlias = columnAlias
    this.parent = parent
  }

  asNode(): NamedRowGenerator {
    const select = this.selectClause ?? {
      nodeType: RelationalNodeType.SELECT,
      columns: [],
    }

    const where = this.whereClause
    const aliasing = this.columnAlias

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

    if (this.parent) {
      node.parent = this.parent
      if (this.parent.children) {
        this.parent.children.push(node)
      } else {
        this.parent.children = [node]
      }
    }

    return node
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
    const parent = this.parent
    this.parent = undefined
    return new SingleJoinNodeBuilder(
      this.builder,
      this,
      tableGenerator(this.builder.select(joinTable)),
      {
        leftColumn: leftColumn as string,
        rightColumn: rightColumn as string,
        op: ColumnFilteringOperation.EQ,
      },
      type,
      parent,
    )
  }

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
  columns<Column extends keyof DataStoreType["tables"][TableName]>(
    column?: unknown,
    ...rest: unknown[]
  ):
    | Omit<
        TableNodeBuilder<
          DataStoreType,
          TableName,
          DataStoreType["tables"][TableName]
        >,
        "columns"
      >
    | Omit<
        TableNodeBuilder<
          DataStoreType,
          TableName,
          Pick<DataStoreType["tables"][TableName], Column>
        >,
        "columns"
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
        this.whereClause,
        this.columnAlias,
        this.parent,
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
      this.whereClause,
      this.columnAlias,
      this.parent,
    )
  }

  build(
    ctor: QueryBuilderCtor<RowType>,
    name: string,
    mode?: ExecutionMode,
  ): Query<RowType> {
    return new ctor(this.asNode()).build(name, mode)
  }

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
  > {
    const aliasing = this.columnAlias ?? []
    aliasing.push({ nodeType: RelationalNodeType.ALIAS, column, alias })
    return new DefaultTableNodeBuilder(
      this.tableName,
      this.builder,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: this.selectClause?.columns ?? [],
      },
      this.whereClause,
      aliasing,
      this.parent,
    )
  }

  where(
    composer: WhereComposer<DataStoreType["tables"][TableName]>,
  ): Omit<TableNodeBuilder<DataStoreType, TableName, RowType>, "where"> {
    const builder = composer(new WhereClauseBuilder())

    return new DefaultTableNodeBuilder(
      this.tableName,
      this.builder,
      this.tableAlias,
      this.selectClause,
      builder.current
        ? {
            nodeType: RelationalNodeType.WHERE,
            filter: builder.current,
          }
        : undefined,
      this.columnAlias,
      this.parent,
    )
  }
}

class ParameterizedDefaultTableNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  TableName extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable = DataStoreType["tables"][TableName],
> implements
    ParameterizedTableNodeBuilder<
      DataStoreType,
      ParameterType,
      TableName,
      RowType
    >
{
  tableName: TableName
  builder: ParameterizedRelationalNodeBuilder<DataStoreType, ParameterType>
  tableAlias?: keyof DataStoreType["tables"]

  private selectClause?: SelectClause
  private whereClause?: WhereClause<DataStoreType["tables"][TableName]>
  private columnAlias?: ColumnAlias<
    DataStoreType["tables"][TableName],
    keyof DataStoreType["tables"][TableName],
    string
  >[]
  private parent?: RelationalQueryNode<RelationalNodeType>

  constructor(
    tableName: TableName,
    builder: ParameterizedRelationalNodeBuilder<DataStoreType, ParameterType>,
    tableAlias?: keyof DataStoreType["tables"],
    selectClause?: SelectClause,
    whereClause?: WhereClause<DataStoreType["tables"][TableName]>,
    columnAlias?: ColumnAlias<
      DataStoreType["tables"][TableName],
      keyof DataStoreType["tables"][TableName],
      string
    >[],
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.tableAlias = tableAlias
    this.selectClause = selectClause
    this.whereClause = whereClause
    this.columnAlias = columnAlias
    this.parent = parent
  }

  asNode(): NamedRowGenerator {
    const select = this.selectClause ?? {
      nodeType: RelationalNodeType.SELECT,
      columns: [],
    }

    const where = this.whereClause
    const aliasing = this.columnAlias

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

    if (this.parent) {
      node.parent = this.parent
      if (this.parent.children) {
        this.parent.children.push(node)
      } else {
        this.parent.children = [node]
      }
    }

    return node
  }

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
    type: JoinType = JoinType.INNER,
  ): ParameterizedJoinNodeBuilder<
    DataStoreType,
    ParameterType,
    TableName | JoinTable,
    MergedNonOverlappingType<RowType, JoinRowType>
  > {
    const parent = this.parent
    this.parent = undefined
    return new ParameterizedSingleJoinNodeBuilder(
      this.builder,
      this,
      tableGenerator(this.builder.select(joinTable)),
      {
        leftColumn: leftColumn as string,
        rightColumn: rightColumn as string,
        op: ColumnFilteringOperation.EQ,
      },
      type,
      parent,
    )
  }

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
  columns<Column extends keyof DataStoreType["tables"][TableName]>(
    column?: unknown,
    ...rest: unknown[]
  ):
    | Omit<
        ParameterizedTableNodeBuilder<
          DataStoreType,
          ParameterType,
          TableName,
          DataStoreType["tables"][TableName]
        >,
        "columns"
      >
    | Omit<
        ParameterizedTableNodeBuilder<
          DataStoreType,
          ParameterType,
          TableName,
          Pick<DataStoreType["tables"][TableName], Column>
        >,
        "columns"
      > {
    if (column === "*") {
      return new ParameterizedDefaultTableNodeBuilder<
        DataStoreType,
        ParameterType,
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
        this.whereClause,
        this.columnAlias,
        this.parent,
      )
    }

    return new ParameterizedDefaultTableNodeBuilder<
      DataStoreType,
      ParameterType,
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
      this.whereClause,
      this.columnAlias,
      this.parent,
    )
  }

  build(
    ctor: ParameterizedQueryBuilderCtor<RowType, ParameterType>,
    name: string,
    mode?: ExecutionMode,
  ): ParameterizedQuery<RowType, ParameterType> {
    return new ctor(this.asNode()).buildParameterized(name, mode)
  }

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
  > {
    const aliasing = this.columnAlias ?? []
    aliasing.push({ nodeType: RelationalNodeType.ALIAS, column, alias })
    return new ParameterizedDefaultTableNodeBuilder(
      this.tableName,
      this.builder,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: this.selectClause?.columns ?? [],
      },
      this.whereClause,
      aliasing,
      this.parent,
    )
  }

  where(
    composer: ParameterizedWhereComposer<
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
  > {
    const builder = composer(new ParameterizedWhereClauseBuilder())

    return new ParameterizedDefaultTableNodeBuilder(
      this.tableName,
      this.builder,
      this.tableAlias,
      this.selectClause,
      builder.current
        ? {
            nodeType: RelationalNodeType.WHERE,
            filter: builder.current,
          }
        : undefined,
      this.columnAlias,
      this.parent,
    )
  }
}

class WhereClauseBuilder<Table extends RelationalDataTable>
  implements WhereBuilder<Table>
{
  current?: FilterGroup<Table> | FilterTypes<Table>

  constructor(current?: FilterGroup<Table> | FilterTypes<Table>) {
    this.current = current
  }

  eq<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: value,
      op: ColumnFilteringOperation.EQ,
    })
  }

  gt<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: value,
      op: ColumnFilteringOperation.GT,
    })
  }

  gte<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: value,
      op: ColumnFilteringOperation.GTE,
    })
  }

  lt<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: value,
      op: ColumnFilteringOperation.LT,
    })
  }

  lte<Column extends keyof Table, ColumnValue extends Table[Column]>(
    column: Column,
    value: ColumnValue,
  ): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: value,
      op: ColumnFilteringOperation.LTE,
    })
  }

  and(...clauses: WhereBuilder<Table>[]): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      filters: clauses.map((c) => c.current).filter(isFilterable),
      op: BooleanOperation.AND,
    })
  }

  or(...clauses: WhereBuilder<Table>[]): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      filters: clauses.map((c) => c.current).filter(isFilterable),
      op: BooleanOperation.OR,
    })
  }

  not(...clauses: WhereBuilder<Table>[]): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      filters: clauses.map((c) => c.current).filter(isFilterable),
      op: BooleanOperation.NOT,
    })
  }

  contains<Column extends PropertyOfType<Table, string>>(
    column: Column,
    value: string,
  ): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: value,
      type: ContainmentObjectType.STRING,
      op: ColumnValueContainsOperation.IN,
    })
  }

  containsItems<
    Column extends ArrayProperty<Table>,
    ColumnValue extends ArrayItemType<Table, Column>,
  >(column: Column, ...values: ColumnValue[]): WhereBuilder<Table> {
    return new WhereClauseBuilder({
      column: column,
      value: values.length === 1 ? values[0] : values,
      type: ContainmentObjectType.ARRAY,
      op: ColumnValueContainsOperation.IN,
    })
  }
}

class ParameterizedWhereClauseBuilder<
  Table extends RelationalDataTable,
  ParameterType extends QueryParameters,
> implements ParameterizedWhereBuilder<Table, ParameterType>
{
  current?: FilterGroup<Table> | FilterTypes<Table>

  constructor(current?: FilterGroup<Table> | FilterTypes<Table>) {
    this.current = current
  }

  eq<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnFilteringOperation.EQ,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
  }

  gt<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnFilteringOperation.GT,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
  }

  gte<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnFilteringOperation.GTE,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
  }

  lt<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnFilteringOperation.LT,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
  }

  lte<
    Column extends keyof Table,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnFilteringOperation.LTE,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
  }

  and(
    ...clauses: ParameterizedWhereBuilder<Table, ParameterType>[]
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      filters: clauses.map((c) => c.current).filter(isFilterable),
      op: BooleanOperation.AND,
    })
  }
  or(
    ...clauses: ParameterizedWhereBuilder<Table, ParameterType>[]
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      filters: clauses.map((c) => c.current).filter(isFilterable),
      op: BooleanOperation.OR,
    })
  }
  not(
    ...clauses: ParameterizedWhereBuilder<Table, ParameterType>[]
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      filters: clauses.map((c) => c.current).filter(isFilterable),
      op: BooleanOperation.NOT,
    })
  }
  contains<
    Column extends PropertyOfType<Table, string>,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnValueContainsOperation.IN,
      type: ContainmentObjectType.STRING,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
  }

  containsItems<
    Column extends ArrayProperty<Table>,
    Parameter extends MatchingProperty<Table, ParameterType, Column>,
  >(
    column: Column,
    parameter: Parameter,
  ): ParameterizedWhereBuilder<Table, ParameterType> {
    return new ParameterizedWhereClauseBuilder({
      column,
      op: ColumnValueContainsOperation.IN,
      type: ContainmentObjectType.ARRAY,
      value: {
        nodeType: RelationalNodeType.PARAMETER,
        name: parameter as string,
      },
    })
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

    const source = tableGenerator(this.builder.select(joinTable))

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

class ParameterizedSingleJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  LeftTable extends keyof DataStoreType["tables"],
  RightTable extends keyof DataStoreType["tables"],
  LeftType extends RelationalDataTable,
  RightType extends RelationalDataTable,
> implements
    ParameterizedJoinNodeBuilder<
      DataStoreType,
      ParameterType,
      LeftTable | RightTable,
      MergedNonOverlappingType<LeftType, RightType>
    >
{
  readonly leftSource: NamedRowGenerator
  readonly rightSource: NamedRowGenerator
  readonly parent?: RelationalQueryNode<RelationalNodeType>

  readonly filter: JoinClauseQueryNode
  readonly builder: ParameterizedRelationalNodeBuilder<
    DataStoreType,
    ParameterType
  >

  readonly joinType: JoinType

  constructor(
    builder: ParameterizedRelationalNodeBuilder<DataStoreType, ParameterType>,
    leftSource: ParameterizedNamedRelationalRowProvider<
      DataStoreType,
      ParameterType,
      LeftTable,
      LeftType
    >,
    rightSource: ParameterizedNamedRelationalRowProvider<
      DataStoreType,
      ParameterType,
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
    LeftTable | RightTable | JoinTable,
    MergedNonOverlappingType<
      MergedNonOverlappingType<LeftType, RightType>,
      TableType
    >
  > {
    const f = this.filter.filter

    const source = tableGenerator(this.builder.select(joinTable))

    return new ParameterizedMultiJoinNodeBuilder<
      DataStoreType,
      ParameterType,
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
    ctor: ParameterizedQueryBuilderCtor<
      MergedNonOverlappingType<LeftType, RightType>,
      ParameterType
    >,
    name: string,
    mode?: ExecutionMode,
  ): ParameterizedQuery<
    MergedNonOverlappingType<LeftType, RightType>,
    ParameterType
  > {
    return new ctor(this.asNode()).buildParameterized(name, mode)
  }
}

class ParameterizedMultiJoinNodeBuilder<
  DataStoreType extends RelationalDataStore,
  ParameterType extends QueryParameters,
  Tables extends keyof DataStoreType["tables"],
  RowType extends RelationalDataTable,
> implements
    ParameterizedJoinNodeBuilder<DataStoreType, ParameterType, Tables, RowType>
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
    _tableGenerator: ParameterizedTableGenerator<
      DataStoreType,
      ParameterType,
      JoinTable,
      TableType
    >,
    _leftColumn: keyof DataStoreType["tables"][JoinTarget],
    _rightColumn: keyof DataStoreType["tables"][JoinTable],
  ): ParameterizedJoinNodeBuilder<
    DataStoreType,
    ParameterType,
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
    ctor: ParameterizedQueryBuilderCtor<RowType, ParameterType>,
    name: string,
    mode?: ExecutionMode,
  ): ParameterizedQuery<RowType, ParameterType> {
    return new ctor(this.asNode()).buildParameterized(name, mode)
  }
}
