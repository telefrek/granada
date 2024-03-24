import type { AliasedType } from "@telefrek/core/type/utils"
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  type Query,
} from "../../query/index"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  ContainmentObjectType,
  JoinType,
  RelationalNodeType,
  isFilter,
  type ColumnAlias,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type JoinClauseQueryNode,
  type NamedRowGenerator,
  type RelationalQueryNode,
  type SelectClause,
  type TableAlias,
  type TableQueryNode,
  type WhereClause,
} from "../ast"
import type { RelationalDataStore, RelationalDataTable, STAR } from "../index"
import {
  type ArrayItemType,
  type ArrayProperty,
  type MergedNonOverlappingType,
  type ModifiedStore,
  type PropertyOfType,
} from "../types"
import {
  type JoinNodeBuilder,
  type QueryBuilder,
  type RelationalNodeBuilder,
  type RelationalProcessorBuilder,
  type TableGenerator,
  type TableNodeBuilder,
  type WhereClauseBuilder,
} from "./index"

/******************************************************************************
 * Internal implementation
 ******************************************************************************/

export class DefaultRelationalNodeBuilder<
  D extends RelationalDataStore,
  Q extends QueryType,
  R extends RelationalDataTable = never,
  P extends QueryParameters = never,
  A extends keyof D["tables"] = never,
> implements RelationalNodeBuilder<D, Q, R, P, A>
{
  #context?: RelationalQueryNode<RelationalNodeType>
  #tableAlias: TableAlias

  // Only all the context to transit to the next node in the chain
  get context(): RelationalQueryNode<RelationalNodeType> | undefined {
    const current = this.#context
    this.#context = undefined

    return current
  }

  get tableAlias(): TableAlias {
    return this.#tableAlias
  }

  queryType: Q
  tableName?: keyof D["tables"]

  constructor(
    queryType: Q,
    context?: RelationalQueryNode<RelationalNodeType>,
    tableAlias: TableAlias = {},
  ) {
    this.queryType = queryType
    this.#context = context
    this.#tableAlias = tableAlias
  }

  withTableAlias<
    TN extends Exclude<keyof D["tables"], A>,
    Alias extends string,
  >(
    table: TN,
    alias: Alias,
  ): RelationalNodeBuilder<
    ModifiedStore<D, Alias, D["tables"][TN]>,
    Q,
    R,
    P,
    A | Alias
  > {
    const a = Object.fromEntries([[alias, table as string]])
    return new DefaultRelationalNodeBuilder<
      ModifiedStore<D, Alias, D["tables"][TN]>,
      Q,
      R,
      P,
      A | Alias
    >(this.queryType, this.#context, {
      ...this.tableAlias,
      ...a,
    })
  }

  withCte<Alias extends string, TT extends RelationalDataTable>(
    alias: Alias,
    source: RelationalProcessorBuilder<D, Q, TT, P, A>,
  ): RelationalNodeBuilder<ModifiedStore<D, Alias, TT>, Q, R, P, A | Alias> {
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

    return new DefaultRelationalNodeBuilder<
      ModifiedStore<D, Alias, TT>,
      Q,
      R,
      P,
      A | Alias
    >(this.queryType, cte, this.tableAlias)
  }

  select<T extends keyof D["tables"]>(
    tableName: T,
  ): TableNodeBuilder<D, T, D["tables"][T], P, Q> {
    const alias: keyof D["tables"] | undefined =
      tableName in this.#tableAlias
        ? this.#tableAlias[tableName as string]
        : undefined
    return new InternalTableBuilder(
      tableName,
      this,
      this.queryType,
      alias,
      undefined,
      undefined,
      undefined,
      this.context,
    )
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    throw new Error("Relation Node Builders cannot themselves provide an AST")
  }

  build(
    _builder: QueryBuilder<Q, R, P>,
    _name: string,
    _mode: ExecutionMode = ExecutionMode.Normal,
  ): Query<Q, R, P> {
    throw new Error(
      "Relation Node Builders cannot themselves provide an AST to build",
    )
  }
}

class InternalJoinBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  Q extends QueryType,
  P extends QueryParameters,
> implements JoinNodeBuilder<D, T, R, P, Q>
{
  tableName?: keyof D["tables"]

  builder: RelationalNodeBuilder<
    D,
    Q,
    RelationalDataTable,
    P,
    keyof D["tables"]
  >
  tables: NamedRowGenerator[]
  filters: JoinClauseQueryNode[]
  queryType: Q
  parent?: RelationalQueryNode<RelationalNodeType>

  constructor(
    builder: RelationalNodeBuilder<
      D,
      Q,
      RelationalDataTable,
      P,
      keyof D["tables"]
    >,
    tables: NamedRowGenerator[],
    filters: JoinClauseQueryNode[],
    queryType: Q,
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.builder = builder
    this.tables = tables
    this.filters = filters
    this.queryType = queryType
    this.parent = parent
  }

  join<
    JT extends T & string,
    JTB extends keyof Exclude<D["tables"], T> & string,
    TT extends RelationalDataTable,
  >(
    target: JT,
    joinTable: JTB,
    tableGenerator: TableGenerator<D, JTB, TT, P, Q>,
    leftColumn: keyof D["tables"][JT] & string,
    rightColumn: keyof D["tables"][JTB] & string,
  ): JoinNodeBuilder<D, T | JTB, MergedNonOverlappingType<R, TT>, P, Q> {
    const filters = this.filters
    filters.push({
      nodeType: RelationalNodeType.ON,
      left: target,
      right: joinTable,
      type: JoinType.INNER,
      filter: {
        leftColumn,
        rightColumn,
        op: ColumnFilteringOperation.EQ,
      },
    })

    const tables = this.tables
    tables.push(
      tableGenerator(
        this.builder.select(joinTable),
      ).asNode() as NamedRowGenerator,
    )

    return new InternalJoinBuilder(
      this.builder,
      tables,
      filters,
      this.queryType,
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

    for (const table of this.tables) {
      table.parent = join
    }

    join.children = [...this.tables]
    join.children.push(...this.filters)

    return join
  }
  build(
    builder: QueryBuilder<Q, R, P>,
    name: string,
    mode?: ExecutionMode | undefined,
  ): Query<Q, R, P> {
    return builder(this.asNode(), this.queryType, name, mode)
  }
}

class InternalTableBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  P extends QueryParameters,
  Q extends QueryType,
> implements TableNodeBuilder<D, T, R, P, Q>
{
  tableName: T
  builder: RelationalNodeBuilder<
    D,
    Q,
    RelationalDataTable,
    P,
    keyof D["tables"]
  >
  tableAlias?: keyof D["tables"]
  private queryType: Q

  private selectClause?: SelectClause
  private whereClause?: WhereClause<D["tables"][T]>
  private columnAlias?: ColumnAlias<D["tables"][T], keyof D["tables"][T]>[]
  private parent?: RelationalQueryNode<RelationalNodeType>

  constructor(
    tableName: T,
    builder: RelationalNodeBuilder<
      D,
      Q,
      RelationalDataTable,
      P,
      keyof D["tables"]
    >,
    queryType: Q,
    tableAlias?: keyof D["tables"],
    selectClause?: SelectClause,
    whereClause?: WhereClause<D["tables"][T]>,
    columnAlias?: ColumnAlias<D["tables"][T], keyof D["tables"][T]>[],
    parent?: RelationalQueryNode<RelationalNodeType>,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.queryType = queryType
    this.tableAlias = tableAlias
    this.selectClause = selectClause
    this.whereClause = whereClause
    this.columnAlias = columnAlias
    this.parent = parent
  }

  columns(column: "*"): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns">
  columns<C extends Extract<keyof D["tables"][T], string>>(
    ...columns: C[]
  ): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns">
  columns<C extends Extract<keyof D["tables"][T], string>>(
    column?: STAR | C,
    ...rest: C[]
  ): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns"> {
    if (column === "*") {
      return new InternalTableBuilder(
        this.tableName,
        this.builder,
        this.queryType,
        this.tableAlias,
        {
          nodeType: RelationalNodeType.SELECT,
          columns: column as STAR,
        },
        this.whereClause,
        this.columnAlias,
        this.parent,
      )
    }

    return new InternalTableBuilder(
      this.tableName,
      this.builder,
      this.queryType,
      this.tableAlias,
      {
        nodeType: RelationalNodeType.SELECT,
        columns: [column as C].concat(rest as C[]),
      },
      this.whereClause,
      this.columnAlias,
      this.parent,
    )
  }

  join<
    JT extends Extract<keyof D["tables"], string>,
    JR extends RelationalDataTable,
  >(
    joinTable: JT,
    tableGenerator: TableGenerator<D, JT, JR, P, Q>,
    leftColumn: keyof D["tables"][T],
    rightColumn: keyof D["tables"][JT],
  ): JoinNodeBuilder<D, JT, MergedNonOverlappingType<R, JR>, P, Q> {
    const parent = this.parent
    this.parent = undefined

    return new InternalJoinBuilder(
      this.builder,
      [
        this.asNode() as NamedRowGenerator,
        tableGenerator(
          this.builder.select(joinTable),
        ).asNode() as NamedRowGenerator,
      ],
      [
        {
          nodeType: RelationalNodeType.ON,
          left: (this.tableAlias ?? this.tableName) as string,
          right: joinTable as string,
          type: JoinType.INNER,
          filter: {
            op: ColumnFilteringOperation.EQ,
            leftColumn: leftColumn as string,
            rightColumn: rightColumn as string,
          },
        },
      ],
      this.queryType,
      parent,
    )
  }

  withColumnAlias<
    C extends keyof R & keyof D["tables"][T],
    Alias extends string,
  >(
    column: C,
    alias: Alias,
  ): TableNodeBuilder<D, T, AliasedType<R, C, Alias>, P, Q> {
    const aliasing = this.columnAlias ?? []
    aliasing.push({ nodeType: RelationalNodeType.ALIAS, column, alias })
    return new InternalTableBuilder(
      this.tableName,
      this.builder,
      this.queryType,
      this.tableAlias,
      this.selectClause,
      this.whereClause,
      aliasing,
      this.parent,
    )
  }

  where(
    clause: (
      builder: WhereClauseBuilder<D["tables"][T], Q, P>,
    ) => WhereClauseBuilder<D["tables"][T], Q, P>,
  ): Omit<TableNodeBuilder<D, T, R, P, Q>, "where"> {
    const filter = clause(new InternalWhereNodeBuilder(this.queryType)).current

    return new InternalTableBuilder(
      this.tableName,
      this.builder,
      this.queryType,
      this.tableAlias,
      this.selectClause,
      filter
        ? {
            filter,
            nodeType: RelationalNodeType.WHERE,
          }
        : undefined,
      this.columnAlias,
      this.parent,
    )
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
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

  build(
    builder: QueryBuilder<Q, R, P>,
    name: string,
    mode?: ExecutionMode | undefined,
  ): Query<Q, R, P> {
    return builder(this.asNode(), this.queryType, name, mode)
  }
}

class InternalWhereNodeBuilder<
  T extends RelationalDataTable,
  Q extends QueryType,
  P extends QueryParameters,
> implements WhereClauseBuilder<T, Q, P>
{
  eq<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      op: ColumnFilteringOperation.EQ,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  gt<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      op: ColumnFilteringOperation.GT,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  gte<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      op: ColumnFilteringOperation.GTE,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  lt<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      op: ColumnFilteringOperation.LT,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  lte<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      op: ColumnFilteringOperation.LTE,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  and(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      filters: clauses.map((c) => c.current).filter(isFilter),
      op: BooleanOperation.AND,
    })
  }
  or(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      filters: clauses.map((c) => c.current).filter(isFilter),
      op: BooleanOperation.OR,
    })
  }
  not(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      filters: clauses.map((c) => c.current).filter(isFilter),
      op: BooleanOperation.NOT,
    })
  }
  contains<C extends PropertyOfType<T, string>>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      type: ContainmentObjectType.STRING,
      op: ColumnValueContainsOperation.IN,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  containsItems<C extends ArrayProperty<T>, CV extends ArrayItemType<T, C>>(
    column: C,
    values: CV[] | ([P] extends [never] ? T[C] : PropertyOfType<P, T[C]>),
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereNodeBuilder(this.queryType, {
      column,
      type: ContainmentObjectType.ARRAY,
      op: ColumnValueContainsOperation.IN,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: values as string }
          : Array.isArray(values)
            ? values.length === 1
              ? values[0]
              : values
            : (values as T[C]),
    })
  }

  current?: FilterGroup<T> | FilterTypes<T>
  queryType: Q

  constructor(queryType: Q, current?: FilterGroup<T> | FilterTypes<T>) {
    this.queryType = queryType
    this.current = current
  }
}
