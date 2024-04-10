import type {
  AliasedType,
  ArrayItemType,
  ArrayProperty,
  MatchingProperty,
  MergedNonOverlappingType,
  PropertyOfType,
} from "@telefrek/core/type/utils.js"
import { QueryError } from "../error.js"
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  makeChild,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryBuilder,
  type RowType,
  type SimpleQuery,
} from "../index.js"
import {
  JoinType,
  SQLNodeType,
  type ColumnAliasClause,
  type CteClause,
  type DeleteClause,
  type InsertClause,
  type JoinClauseQueryNode,
  type ReturningClause,
  type SQLQueryNode,
  type SelectClause,
  type SetClause,
  type TableAlias,
  type TableSQLQueryNode,
  type UpdateClause,
  type WhereClause,
} from "./ast.js"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  ContainmentObjectType,
  type ColumnFilter,
  type ContainmentFilter,
  type FilterGroup,
  type FilterTypes,
} from "./filtering.js"
import {
  type DeleteBuilder,
  type InsertBuilder,
  type JoinNodeBuilder,
  type ModifiedStore,
  type SQLNodeBuilder,
  type SQLProcessorBuilder,
  type SelectBuilder,
  type TableGenerator,
  type UpdateBuilder,
  type WhereClauseBuilder,
} from "./queryBuilder.js"
import { isFilter } from "./typeGuards.js"
import type {
  RelationalQueryBuilder,
  SQLDataStore,
  SQLDataTable,
  STAR,
} from "./types.js"

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
  _context?: SQLQueryNode<SQLNodeType>
  _tableAlias: TableAlias

  // Only all the context to transit to the next node in the chain
  get context(): SQLQueryNode<SQLNodeType> | undefined {
    const current = this._context
    this._context = undefined

    return current
  }

  get tableAlias(): TableAlias {
    return this._tableAlias
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
    this._context = context
    this._tableAlias = tableAlias
  }

  delete<T extends keyof D["tables"]>(
    tableName: T,
  ): DeleteBuilder<D, T, never, P, Q> {
    return new InternalDeleteBuilder(
      tableName,
      new DefaultSQLNodeBuilder(
        this.queryType,
        this.queryBuilder,
        this._context,
        this.tableAlias,
      ),
    )
  }

  update<T extends keyof D["tables"]>(
    tableName: T,
  ): UpdateBuilder<D, T, never, P, Q, never> {
    return new InternalUpdateBuilder(
      tableName,
      new DefaultSQLNodeBuilder(
        this.queryType,
        this.queryBuilder,
        this._context,
        this.tableAlias,
      ),
    )
  }

  insert<T extends keyof D["tables"]>(
    tableName: T,
  ): InsertBuilder<D, T, never, D["tables"][T]> {
    return new InternalInsertBuilder(
      tableName,
      new DefaultSQLNodeBuilder(
        QueryType.PARAMETERIZED,
        this.queryBuilder,
        this._context,
        this.tableAlias,
      ),
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
      this._context,
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
    >(this.queryType, this.queryBuilder, this._context, {
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
  ): SelectBuilder<D, T, D["tables"][T], P, Q> {
    const alias: keyof D["tables"] | undefined =
      tableName in this._tableAlias
        ? this._tableAlias[tableName as string]
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

class InternalDeleteBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends SQLDataTable,
  Q extends BuildableQueryTypes,
> implements DeleteBuilder<D, T, R, P, Q>
{
  tableName: T
  returningColumns?: string[] | STAR
  builder: SQLNodeBuilderContext<D, Q, R>
  whereClause?: WhereClause

  constructor(
    tableName: T,
    builder: SQLNodeBuilderContext<D, Q, R>,
    returningColumns?: string[] | STAR,
    whereClause?: WhereClause,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.returningColumns = returningColumns
    this.whereClause = whereClause
  }

  returning(columns: "*"): DeleteBuilder<D, T, D["tables"][T], P, Q>
  returning<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): DeleteBuilder<D, T, Pick<D["tables"][T], C>, P, Q>
  returning<C extends keyof D["tables"][T]>(
    columns?: C | STAR,
    ...rest: C[]
  ):
    | DeleteBuilder<D, T, D["tables"][T], P, Q>
    | DeleteBuilder<D, T, Pick<D["tables"][T], C>, P, Q> {
    if (columns === "*") {
      return new InternalDeleteBuilder<D, T, D["tables"][T], P, Q>(
        this.tableName,
        this.builder,
        columns,
        this.whereClause,
      )
    }

    return new InternalDeleteBuilder<D, T, Pick<D["tables"][T], C>, P, Q>(
      this.tableName,
      this.builder,
      rest
        ? [columns as string].concat(rest.map((r: C) => r as string))
        : columns
          ? [columns as string]
          : undefined,
      this.whereClause,
    )
  }

  where(
    clause: (
      builder: WhereClauseBuilder<D["tables"][T], Q, P>,
    ) => WhereClauseBuilder<D["tables"][T], Q, P>,
  ): Omit<DeleteBuilder<D, T, R, P, Q>, "where"> {
    const filter = clause(
      new InternalWhereClauseBuilder<D["tables"][T], Q, P>(
        this.builder.queryType,
      ),
    ).current

    return new InternalDeleteBuilder(
      this.tableName,
      this.builder,
      this.returningColumns,
      filter
        ? {
            filter,
            nodeType: SQLNodeType.WHERE,
          }
        : undefined,
    )
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    const d: DeleteClause = {
      nodeType: SQLNodeType.DELETE,
      tableName: this.tableName as string,
    }

    if (this.returningColumns) {
      const returning: ReturningClause = {
        nodeType: SQLNodeType.RETURNING,
        columns: this.returningColumns,
      }

      makeChild(d, returning)
    }

    if (this.whereClause) {
      makeChild(d, this.whereClause)
    }

    return d
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

class InternalUpdateBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends SQLDataTable,
  Q extends BuildableQueryTypes,
  U extends keyof D["tables"][T],
> implements UpdateBuilder<D, T, R, P, Q, U>
{
  tableName: T
  returningColumns?: string[] | STAR
  setClauses?: SetClause[]
  builder: SQLNodeBuilderContext<D, Q, R>
  whereClause?: WhereClause

  constructor(
    tableName: T,
    builder: SQLNodeBuilderContext<D, Q, R>,
    setClauses?: SetClause[],
    returningColumns?: string[] | STAR,
    whereClause?: WhereClause,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.setClauses = setClauses
    this.returningColumns = returningColumns
    this.whereClause = whereClause
  }

  set<C extends Exclude<keyof D["tables"][T], U>>(
    column: C,
    value: [P] extends [never]
      ? D["tables"][T][C]
      : PropertyOfType<P, D["tables"][T][C]>,
  ): UpdateBuilder<D, T, Pick<D["tables"][T], C>, P, Q, U | C> {
    const setClauses = this.setClauses ?? []

    setClauses.push(
      this.builder.queryType === QueryType.PARAMETERIZED
        ? {
            type: "parameter",
            column: column as string,
            name: value as string,
          }
        : {
            type: "value",
            column: column as string,
            value,
          },
    )

    return new InternalUpdateBuilder<D, T, D["tables"][T], P, Q, U | C>(
      this.tableName as T,
      this.builder,
      setClauses,
      this.returningColumns,
      this.whereClause,
    )
  }

  returning(columns: "*"): UpdateBuilder<D, T, D["tables"][T], P, Q, U>
  returning<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): UpdateBuilder<D, T, Pick<D["tables"][T], C>, P, Q, U>
  returning<C extends keyof D["tables"][T]>(
    columns?: C | STAR,
    ...rest: C[]
  ):
    | UpdateBuilder<D, T, D["tables"][T], P, Q, U>
    | UpdateBuilder<D, T, Pick<D["tables"][T], C>, P, Q, U> {
    if (columns === "*") {
      return new InternalUpdateBuilder<D, T, D["tables"][T], P, Q, U>(
        this.tableName,
        this.builder,
        this.setClauses,
        columns,
        this.whereClause,
      )
    }

    return new InternalUpdateBuilder<D, T, Pick<D["tables"][T], C>, P, Q, U>(
      this.tableName,
      this.builder,
      this.setClauses,
      rest
        ? [columns as string].concat(rest.map((r: C) => r as string))
        : columns
          ? [columns as string]
          : undefined,
      this.whereClause,
    )
  }

  where(
    clause: (
      builder: WhereClauseBuilder<D["tables"][T], Q, P>,
    ) => WhereClauseBuilder<D["tables"][T], Q, P>,
  ): Omit<UpdateBuilder<D, T, R, P, Q, U>, "where"> {
    const filter = clause(
      new InternalWhereClauseBuilder<D["tables"][T], Q, P>(
        this.builder.queryType,
      ),
    ).current

    return new InternalUpdateBuilder(
      this.tableName,
      this.builder,
      this.setClauses,
      this.returningColumns,
      filter
        ? {
            filter,
            nodeType: SQLNodeType.WHERE,
          }
        : undefined,
    )
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    const update: UpdateClause = {
      nodeType: SQLNodeType.UPDATE,
      tableName: this.tableName as string,
      setColumns: this.setClauses ?? [],
    }

    if (this.returningColumns) {
      const returning: ReturningClause = {
        nodeType: SQLNodeType.RETURNING,
        columns: this.returningColumns,
      }

      makeChild(update, returning)
    }

    if (this.whereClause) {
      makeChild(update, this.whereClause)
    }

    return update
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

class InternalInsertBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable = never,
  P extends RowType = D["tables"][T],
> implements InsertBuilder<D, T, R, P>
{
  tableName: T
  insertColumns?: string[]
  returningColumns?: string[] | STAR
  builder: SQLNodeBuilderContext<D, QueryType.PARAMETERIZED, R>

  constructor(
    tableName: T,
    builder: SQLNodeBuilderContext<D, QueryType.PARAMETERIZED, R>,
    columns?: string[],
    returningColumns?: string[] | STAR,
  ) {
    this.tableName = tableName
    this.builder = builder
    this.insertColumns = columns
    this.returningColumns = returningColumns
  }

  columns<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): Omit<InsertBuilder<D, T, R, Pick<D["tables"][T], C>>, "columns"> {
    return new InternalInsertBuilder(
      this.tableName,
      this.builder,
      columns as string[],
      this.returningColumns,
    )
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
      return new InternalInsertBuilder<D, T, D["tables"][T], P>(
        this.tableName,
        this.builder,
        this.insertColumns,
        columns,
      )
    }

    return new InternalInsertBuilder<D, T, Pick<D["tables"][T], C>, P>(
      this.tableName,
      this.builder,
      this.insertColumns,
      rest
        ? [columns as string].concat(rest.map((r: C) => r as string))
        : columns
          ? [columns as string]
          : undefined,
    )
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    const insert: InsertClause = {
      nodeType: SQLNodeType.INSERT,
      tableName: this.tableName as string,
      columns: this.insertColumns,
    }

    if (this.returningColumns) {
      const returning: ReturningClause = {
        nodeType: SQLNodeType.RETURNING,
        columns: this.returningColumns,
      }

      makeChild(insert, returning)
    }

    return insert
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
  tables: TableSQLQueryNode<SQLNodeType>[]
  filters: JoinClauseQueryNode[]
  parent?: SQLQueryNode<SQLNodeType>

  constructor(
    builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>,
    tables: TableSQLQueryNode<SQLNodeType>[],
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
      tableGenerator(
        this.builder.select(joinTable),
      ).asNode() as TableSQLQueryNode<SQLNodeType>,
    )

    return new InternalJoinBuilder(this.builder, tables, filters, this.parent)
  }

  asNode(): SQLQueryNode<SQLNodeType> {
    const join: SQLQueryNode<SQLNodeType.JOIN> = {
      nodeType: SQLNodeType.JOIN,
    }

    if (this.parent) {
      makeChild(this.parent, join)
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
> implements SelectBuilder<D, T, R, P, Q>
{
  tableName: T
  builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>
  tableAlias?: keyof D["tables"]

  private selectClause?: SelectClause
  private whereClause?: WhereClause
  private columnAlias?: Map<string, string>
  private parent?: SQLQueryNode<SQLNodeType>

  constructor(
    tableName: T,
    builder: SQLNodeBuilderContext<D, Q, SQLDataTable, P, keyof D["tables"]>,
    tableAlias?: keyof D["tables"],
    selectClause?: SelectClause,
    whereClause?: WhereClause,
    columnAlias?: Map<string, string>,
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

  columns(column: "*"): Omit<SelectBuilder<D, T, R, P, Q>, "columns">
  columns<C extends Extract<keyof D["tables"][T], string>>(
    ...columns: C[]
  ): Omit<SelectBuilder<D, T, R, P, Q>, "columns">
  columns<C extends Extract<keyof D["tables"][T], string>>(
    column?: STAR | C,
    ...rest: C[]
  ): Omit<SelectBuilder<D, T, R, P, Q>, "columns"> {
    if (column === "*") {
      return new InternalTableBuilder(
        this.tableName,
        this.builder,
        this.tableAlias,
        {
          nodeType: SQLNodeType.SELECT,
          tableName: this.tableName as string,
          alias: this.tableAlias as string,
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
        tableName: this.tableName as string,
        alias: this.tableAlias as string,
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
        this.asNode() as TableSQLQueryNode<SQLNodeType>,
        tableGenerator(
          this.builder.select(joinTable),
        ).asNode() as TableSQLQueryNode<SQLNodeType>,
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
  ): SelectBuilder<D, T, AliasedType<R, C, Alias>, P, Q> {
    const aliasing = this.columnAlias ?? new Map()
    aliasing.set(column as string, alias)
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
  ): Omit<SelectBuilder<D, T, R, P, Q>, "where"> {
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
      tableName: this.tableName as string,
      alias: this.tableAlias as string,
      nodeType: SQLNodeType.SELECT,
      columns: [],
    }

    if (this.whereClause) {
      makeChild(select, this.whereClause)
    }

    if (this.columnAlias) {
      const aliasing: ColumnAliasClause = {
        nodeType: SQLNodeType.ALIAS,
        aliasing: this.columnAlias,
      }

      makeChild(select, aliasing)
    }

    if (this.parent) {
      makeChild(this.parent, select)
    }

    return select
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
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._columnFilter(column as string, ColumnFilteringOperation.EQ, value),
    )
  }

  gt<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._columnFilter(column as string, ColumnFilteringOperation.GT, value),
    )
  }

  gte<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._columnFilter(column as string, ColumnFilteringOperation.GTE, value),
    )
  }

  lt<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._columnFilter(column as string, ColumnFilteringOperation.LT, value),
    )
  }

  lte<C extends keyof T>(
    column: C,
    value: [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._columnFilter(column as string, ColumnFilteringOperation.LTE, value),
    )
  }

  _columnFilter(
    column: string,
    op: ColumnFilteringOperation,
    value: unknown,
  ): ColumnFilter {
    return this.queryType === QueryType.PARAMETERIZED
      ? {
          column,
          op,
          type: "parameter",
          name: value as string,
        }
      : {
          column,
          op,
          type: "value",
          value,
        }
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
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._containmentFilter(
        column as string,
        ColumnValueContainsOperation.IN,
        ContainmentObjectType.STRING,
        value,
      ),
    )
  }

  containsItems<C extends ArrayProperty<T>>(
    column: C,
    value: [P] extends [never]
      ? T[C] | ArrayItemType<T, C>
      : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P> {
    return new InternalWhereClauseBuilder(
      this.queryType,
      this._containmentFilter(
        column as string,
        ColumnValueContainsOperation.IN,
        ContainmentObjectType.ARRAY,
        Array.isArray(value)
          ? value.length === 1
            ? (value[0] as T[C])
            : (value as T[C][])
          : value,
      ),
    )
  }

  _containmentFilter<T extends ContainmentObjectType>(
    column: string,
    op: ColumnValueContainsOperation,
    columnType: T,
    value: unknown,
  ): ContainmentFilter<T> {
    return this.queryType === QueryType.PARAMETERIZED
      ? {
          column,
          columnType,
          op,
          type: "parameter",
          name: value as string,
        }
      : {
          column,
          columnType,
          op,
          type: "value",
          value,
        }
  }

  current?: FilterGroup | FilterTypes
  queryType: Q

  constructor(queryType: Q, current?: FilterGroup | FilterTypes) {
    this.queryType = queryType
    this.current = current
  }
}
