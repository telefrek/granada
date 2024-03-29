import type {
  AliasedType,
  ArrayItemType,
  ArrayProperty,
  MatchingProperty,
  MergedNonOverlappingType,
  PropertyOfType,
} from "@telefrek/core/type/utils"
import { QueryError } from "../../error"
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryBuilder,
  type RowType,
  type SimpleQuery,
} from "../../index"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  ContainmentObjectType,
  JoinType,
  SQLNodeType,
  isFilter,
  type ColumnAlias,
  type CteClause,
  type FilterGroup,
  type FilterTypes,
  type InsertClause,
  type JoinClauseQueryNode,
  type SQLQueryNode,
  type SelectClause,
  type TableAlias,
  type TableQueryNode,
  type WhereClause,
} from "../ast"
import type {
  RelationalQueryBuilder,
  SQLDataStore,
  SQLDataTable,
  STAR,
} from "../index"
import {
  type InsertBuilder,
  type JoinNodeBuilder,
  type ModifiedStore,
  type SQLNodeBuilder,
  type SQLProcessorBuilder,
  type TableGenerator,
  type TableNodeBuilder,
  type WhereClauseBuilder,
} from "./index"

/******************************************************************************
 * Internal implementation
 ******************************************************************************/

interface SQLNodeBuilderContext<
  D extends SQLDataStore,
  Q extends BuildableQueryTypes = QueryType.SIMPLE,
  R extends SQLDataTable = never,
  P extends QueryParameters = never,
  A extends keyof D["tables"] = never,
> extends SQLNodeBuilder<D, Q, R, P, A> {
  queryType: Q
  context: SQLQueryNode<SQLNodeType> | undefined
  tableAlias: TableAlias
  queryBuilder: QueryBuilder
}

export class DefaultSQLNodeBuilder<
  D extends SQLDataStore,
  Q extends BuildableQueryTypes,
  R extends SQLDataTable = never,
  P extends QueryParameters = never,
  A extends keyof D["tables"] = never,
> implements SQLNodeBuilderContext<D, Q, R, P, A>
{
  #context?: SQLQueryNode<SQLNodeType>
  #tableAlias: TableAlias

  // Only all the context to transit to the next node in the chain
  get context(): SQLQueryNode<SQLNodeType> | undefined {
    const current = this.#context
    this.#context = undefined

    return current
  }

  get tableAlias(): TableAlias {
    return this.#tableAlias
  }

  queryBuilder: QueryBuilder
  queryType: Q
  tableName?: keyof D["tables"]

  constructor(
    queryType: Q,
    queryBuilder: RelationalQueryBuilder<D>,
    context?: SQLQueryNode<SQLNodeType>,
    tableAlias: TableAlias = {},
  ) {
    this.queryType = queryType
    this.queryBuilder = queryBuilder
    this.#context = context
    this.#tableAlias = tableAlias
  }

  insert<T extends keyof D["tables"], C extends keyof D["tables"][T]>(
    tableName: T,
    columns: C[],
  ): InsertBuilder<D, T, never, Pick<D["tables"][T], C>> {
    return new InternalInsertBuilder(
      tableName,
      new DefaultSQLNodeBuilder(
        QueryType.PARAMETERIZED,
        this.queryBuilder,
        this.#context,
        this.tableAlias,
      ),
      columns,
    )
  }

  withParameters<QP extends QueryParameters>(): SQLNodeBuilder<
    D,
    QueryType.PARAMETERIZED,
    R,
    QP,
    A
  > {
    if (this.queryType !== QueryType.SIMPLE) {
      throw new QueryError("Query Parameters are already defined")
    }

    return new DefaultSQLNodeBuilder(
      QueryType.PARAMETERIZED,
      this.queryBuilder,
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
  ): SQLNodeBuilder<
    ModifiedStore<D, Alias, D["tables"][TN]>,
    Q,
    R,
    P,
    A | Alias
  > {
    const a = Object.fromEntries([[alias, table as string]])
    return new DefaultSQLNodeBuilder<
      ModifiedStore<D, Alias, D["tables"][TN]>,
      Q,
      R,
      P,
      A | Alias
    >(this.queryType, this.queryBuilder, this.#context, {
      ...this.tableAlias,
      ...a,
    })
  }

  withCte<Alias extends string, TT extends SQLDataTable>(
    alias: Alias,
    source: SQLProcessorBuilder<D, Q, R, P, A, TT>,
  ): SQLNodeBuilder<ModifiedStore<D, Alias, TT>, Q, R, P, A | Alias> {
    // Get the row generator
    const generator = source(this).asNode()

    const parent = generator.parent

    const cte: CteClause = {
      tableName: alias,
      nodeType: SQLNodeType.CTE,
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

    return new DefaultSQLNodeBuilder<
      ModifiedStore<D, Alias, TT>,
      Q,
      R,
      P,
      A | Alias
    >(this.queryType, this.queryBuilder, cte, this.tableAlias)
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
      alias,
      undefined,
      undefined,
      undefined,
      this.context,
    )
  }
}

class InternalInsertBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  IC extends keyof D["tables"][T],
  R extends SQLDataTable = never,
  P extends RowType = Pick<D["tables"][T], IC>,
> implements InsertBuilder<D, T, R, P>
{
  tableName: T
  returningColumns?: string[] | STAR
  columns: IC[]
  builder: SQLNodeBuilderContext<D, QueryType.PARAMETERIZED, R>

  constructor(
    tableName: T,
    builder: SQLNodeBuilderContext<D, QueryType.PARAMETERIZED, R>,
    columns: IC[],
    returningColumns?: string[] | STAR,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.columns = columns
    this.returningColumns = returningColumns
  }

  returning(columns: "*"): InsertBuilder<D, T, D["tables"][T], P>
  returning<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): InsertBuilder<D, T, Pick<D["tables"][T], C>, P>
  returning<C extends keyof D["tables"][T]>(
    columns?: C | STAR,
    ...rest: C[]
  ):
    | InsertBuilder<D, T, D["tables"][T], P>
    | InsertBuilder<D, T, Pick<D["tables"][T], C>, P> {
    if (columns === "*") {
      return new InternalInsertBuilder<D, T, IC, D["tables"][T], P>(
        this.tableName,
        this.builder,
        this.columns,
        columns,
      )
    }

    return new InternalInsertBuilder<D, T, IC, Pick<D["tables"][T], C>, P>(
      this.tableName,
      this.builder,
      this.columns,
      rest
        ? [columns as string].concat(rest.map((r: C) => r as string))
        : columns
          ? [columns as string]
          : undefined,
    )
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    return {
      nodeType: SQLNodeType.INSERT,
      tableName: this.tableName,
      returning: this.returningColumns,
    } as InsertClause
  }

  build(
    name: string,
    mode: ExecutionMode = ExecutionMode.Normal,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    return this.builder.queryBuilder.build(
      this.asNode(),
      QueryType.PARAMETERIZED,
      name,
      mode,
    )
  }
}

class InternalJoinBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  Q extends BuildableQueryTypes,
  P extends QueryParameters,
> implements JoinNodeBuilder<D, T, R, P, Q>
{
  tableName?: keyof D["tables"]

  builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>
  tables: TableQueryNode[]
  filters: JoinClauseQueryNode[]
  parent?: SQLQueryNode<SQLNodeType>

  constructor(
    builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>,
    tables: TableQueryNode[],
    filters: JoinClauseQueryNode[],
    parent?: SQLQueryNode<SQLNodeType>,
  ) {
    this.builder = builder
    this.tables = tables
    this.filters = filters
    this.parent = parent
  }

  join<
    JT extends T & string,
    JTB extends keyof Exclude<D["tables"], T> & string,
    TT extends SQLDataTable,
    LC extends keyof D["tables"][JT] & string,
  >(
    target: JT,
    joinTable: JTB,
    tableGenerator: TableGenerator<D, JTB, TT, P, Q>,
    leftColumn: LC,
    rightColumn: MatchingProperty<D["tables"][JT], D["tables"][JT], LC> &
      string,
  ): JoinNodeBuilder<D, T | JTB, MergedNonOverlappingType<R, TT>, P, Q> {
    const filters = this.filters
    filters.push({
      nodeType: SQLNodeType.ON,
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

    return new InternalJoinBuilder(this.builder, tables, filters, this.parent)
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    const join: SQLQueryNode<SQLNodeType.JOIN> = {
      parent: this.parent,
      nodeType: SQLNodeType.JOIN,
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
    name: string,
    mode: ExecutionMode = ExecutionMode.Normal,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    return this.builder.queryBuilder.build(
      this.asNode(),
      this.builder.queryType,
      name,
      mode,
    )
  }
}

class InternalTableBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
> implements TableNodeBuilder<D, T, R, P, Q>
{
  tableName: T
  builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>
  tableAlias?: keyof D["tables"]

  private selectClause?: SelectClause
  private whereClause?: WhereClause
  private columnAlias?: ColumnAlias[]
  private parent?: SQLQueryNode<SQLNodeType>

  constructor(
    tableName: T,
    builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>,
    tableAlias?: keyof D["tables"],
    selectClause?: SelectClause,
    whereClause?: WhereClause,
    columnAlias?: ColumnAlias[],
    parent?: SQLQueryNode<SQLNodeType>,
  ) {
    this.tableName = tableName
    this.builder = builder
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
        this.tableAlias,
        {
          nodeType: SQLNodeType.SELECT,
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
      this.tableAlias,
      {
        nodeType: SQLNodeType.SELECT,
        columns: [column as C].concat(rest as C[]),
      },
      this.whereClause,
      this.columnAlias,
      this.parent,
    )
  }

  join<
    JT extends keyof D["tables"],
    JR extends SQLDataTable,
    LC extends keyof D["tables"][T] & string,
  >(
    joinTable: JT,
    tableGenerator: TableGenerator<D, JT, JR, P, Q>,
    leftColumn: LC,
    rightColumn: MatchingProperty<D["tables"][T], D["tables"][JT], LC> & string,
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
          nodeType: SQLNodeType.ON,
          left: (this.tableAlias ?? this.tableName) as string,
          right: joinTable as string,
          type: JoinType.INNER,
          filter: {
            op: ColumnFilteringOperation.EQ,
            leftColumn: leftColumn,
            rightColumn: rightColumn,
          },
        },
      ],
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
    aliasing.push({ nodeType: SQLNodeType.ALIAS, column, alias })
    return new InternalTableBuilder(
      this.tableName,
      this.builder,
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
      new InternalWhereClauseBuilder(this.builder.queryType),
    ).current

    return new InternalTableBuilder(
      this.tableName,
      this.builder,
      this.tableAlias,
      this.selectClause,
      filter
        ? {
            filter,
            nodeType: SQLNodeType.WHERE,
          }
        : undefined,
      this.columnAlias,
      this.parent,
    )
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    const select = this.selectClause ?? {
      nodeType: SQLNodeType.SELECT,
      columns: [],
    }

    const where = this.whereClause
    const aliasing = this.columnAlias

    const node: TableQueryNode = {
      nodeType: SQLNodeType.TABLE,
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
    name: string,
    mode: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<R> : ParameterizedQuery<R, P> {
    return this.builder.queryBuilder.build(
      this.asNode(),
      this.builder.queryType,
      name,
      mode,
    )
  }
}

class InternalWhereClauseBuilder<
  T extends SQLDataTable,
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
          ? { nodeType: SQLNodeType.PARAMETER, name: value as string }
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
