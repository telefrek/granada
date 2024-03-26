import type {
  AliasedType,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils"
import { QueryError } from "../../error"
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryBuilder,
  type SimpleQuery,
} from "../../index"
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
  type InsertClause,
  type JoinClauseQueryNode,
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
  type InsertBuilder,
  type JoinNodeBuilder,
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
  Q extends BuildableQueryTypes,
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
  insert<T extends keyof D["tables"]>(
    tableName: T,
  ): InsertBuilder<D, T, never, D["tables"][T]> {
    return new InternalInsertBuilder(tableName)
  }

  withParameters<QP extends QueryParameters>(): RelationalNodeBuilder<
    D,
    QueryType.PARAMETERIZED,
    R,
    QP,
    A
  > {
    if (this.queryType !== QueryType.SIMPLE) {
      throw new QueryError("Query Parameters are already defined")
    }

    return new DefaultRelationalNodeBuilder(
      QueryType.PARAMETERIZED,
      this.#context,
      this.tableAlias,
    )
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
    source: RelationalProcessorBuilder<D, Q, R, P, A, TT>,
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
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    throw new Error(
      "Relation Node Builders cannot themselves provide an AST to build",
    )
  }
}

class InternalInsertBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable = never,
  P extends RequiredLiteralKeys<D["tables"][T]> = D["tables"][T],
> implements InsertBuilder<D, T, R, P>
{
  tableName: T
  returningColumns?: string[]

  constructor(tableName: T, returningColumns?: string[]) {
    this.tableName = tableName
    this.returningColumns = returningColumns
  }

  returning<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): InsertBuilder<D, T, Pick<D["tables"][T], C>, P> {
    return new InternalInsertBuilder(
      this.tableName,
      columns.map((c) => c as string),
    )
  }

  asNode(): RelationalQueryNode<RelationalNodeType> {
    return {
      nodeType: RelationalNodeType.INSERT,
      tableName: this.tableName,
      returning: this.returningColumns,
    } as InsertClause
  }

  build(
    builder: QueryBuilder<QueryType.PARAMETERIZED, R, P>,
    name: string,
    mode: ExecutionMode = ExecutionMode.Normal,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    return builder()(this.asNode(), QueryType.PARAMETERIZED, name, mode)
  }
}

class InternalJoinBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  Q extends BuildableQueryTypes,
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
  tables: TableQueryNode[]
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
    tables: TableQueryNode[],
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
      tableGenerator(this.builder.select(joinTable)).asNode() as TableQueryNode,
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
    mode: ExecutionMode = ExecutionMode.Normal,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    return builder()(this.asNode(), this.queryType, name, mode)
  }
}

class InternalTableBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
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
  private whereClause?: WhereClause
  private columnAlias?: ColumnAlias[]
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
    whereClause?: WhereClause,
    columnAlias?: ColumnAlias[],
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

  join<JT extends keyof D["tables"], JR extends RelationalDataTable>(
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
        this.asNode() as TableQueryNode,
        tableGenerator(
          this.builder.select(joinTable),
        ).asNode() as TableQueryNode,
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
    C extends keyof R & keyof D["tables"][T] & string,
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
    const filter = clause(
      new InternalWhereClauseBuilder(this.queryType),
    ).current

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
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    return builder()(this.asNode(), this.queryType, name, mode)
  }
}

class InternalWhereClauseBuilder<
  T extends RelationalDataTable,
  Q extends BuildableQueryTypes,
  P extends QueryParameters,
> implements WhereClauseBuilder<T, Q, P>
{
  eq<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(this.queryType, {
      column: column as string,
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
    return new InternalWhereClauseBuilder(this.queryType, {
      column: column as string,
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
    return new InternalWhereClauseBuilder(this.queryType, {
      column: column as string,
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
    return new InternalWhereClauseBuilder(this.queryType, {
      column: column as string,
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
    return new InternalWhereClauseBuilder(this.queryType, {
      column: column as string,
      op: ColumnFilteringOperation.LTE,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }
  and(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(this.queryType, {
      filters: clauses.map((c) => c.current).filter(isFilter),
      op: BooleanOperation.AND,
    })
  }
  or(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(this.queryType, {
      filters: clauses.map((c) => c.current).filter(isFilter),
      op: BooleanOperation.OR,
    })
  }
  not(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(this.queryType, {
      filters: clauses.map((c) => c.current).filter(isFilter),
      op: BooleanOperation.NOT,
    })
  }
  contains<C extends PropertyOfType<T, string>>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(this.queryType, {
      column: column as string,
      type: ContainmentObjectType.STRING,
      op: ColumnValueContainsOperation.IN,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : (value as T[C]),
    })
  }

  containsItems<C extends ArrayProperty<T>>(
    column: C,
    value: [P] extends [never]
      ? T[C] | ArrayItemType<T, C>
      : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(this.queryType, {
      op: ColumnValueContainsOperation.IN,
      type: ContainmentObjectType.ARRAY,
      column: column as string,
      value:
        this.queryType === QueryType.PARAMETERIZED
          ? { nodeType: RelationalNodeType.PARAMETER, name: value as string }
          : Array.isArray(value)
            ? value.length === 1
              ? (value[0] as T[C])
              : (value as T[C][])
            : (value as T[C]),
    })
  }

  current?: FilterGroup | FilterTypes
  queryType: Q

  constructor(queryType: Q, current?: FilterGroup | FilterTypes) {
    this.queryType = queryType
    this.current = current
  }
}
