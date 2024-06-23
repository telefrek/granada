import type { Flatten } from "@telefrek/type-utils"
import type { UnionToTuple } from "@telefrek/type-utils/unsafe.js"
import type {
  ColumnReference,
  LogicalExpression,
  NamedQuery,
  SQLQuery,
  SelectClause,
  SelectedColumn,
  TableReference,
  WhereClause,
} from "../ast.js"
import {
  type ColumnTypeDefinition,
  type SQLDatabaseSchema,
  type SQLDatabaseTables,
} from "../schema.js"
import type { SQLBuiltinTypes } from "../types.js"
import type { QueryAST } from "./common.js"
import {
  type ChangeContextReturning,
  type QueryContext,
  type QueryContextColumns,
} from "./context.js"
import {
  buildColumnReference,
  type AliasedValue,
  type BuildColumnReferences,
  type getColumnType,
} from "./utils.js"
import {
  whereClause,
  type AddWhereToAST,
  type WhereBuilder,
  type WhereClauseBuilder,
} from "./where.js"

/**
 * Allows selecting columns for a Select statement
 */
export interface SelectColumnsBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  From extends TableReference | NamedQuery,
> {
  columns<
    Columns extends
      | QueryContextColumns<Context>
      | AliasedValue<QueryContextColumns<Context>>,
    Next extends SelectBuilder<
      Database,
      ModifyReturn<Context, Columns>,
      SelectClause<CheckColumns<Columns>, From>
    >,
  >(
    first: CheckColumn<Columns>,
    ...rest: CheckColumn<Columns>[]
  ): Next
}

/**
 * Full select clause builder
 */
export interface SelectBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Query extends SelectClause,
> extends QueryAST<Query>,
    SelectColumnsBuilder<Database, Context, Query["from"]>,
    WhereBuilder<
      Database,
      Context,
      Query,
      SelectBuilder<Database, Context, Query>
    > {}

/**
 * Check to ensure the alias has a valid string since {@link AliasedValue} allows
 * "" as a valid string
 */
export type CheckColumn<T> = T extends `${infer _} AS ${infer Alias}`
  ? Alias extends ""
    ? never
    : T
  : T

type ColumnDetails<Column extends string, Type extends SQLBuiltinTypes> = {
  column: Column
  type: Type
}

type MapColumns<
  Columns extends string,
  Active extends SQLDatabaseTables,
> = Columns extends `${infer Column} AS ${infer Alias}`
  ? getColumnType<Column, Active> extends SQLBuiltinTypes
    ? ColumnDetails<Alias, getColumnType<Column, Active>>
    : never
  : getColumnType<Columns, Active> extends SQLBuiltinTypes
    ? ColumnDetails<Columns, getColumnType<Columns, Active>>
    : never

type ToSchema<T, O = object> = T extends [infer Head, ...infer Rest]
  ? Rest extends never[]
    ? Head extends ColumnDetails<infer Column, infer Type>
      ? Flatten<O & { [key in Column]: ColumnTypeDefinition<Type> }>
      : never
    : Head extends ColumnDetails<infer Column, infer Type>
      ? ToSchema<
          Rest,
          Flatten<O & { [key in Column]: ColumnTypeDefinition<Type> }>
        >
      : never
  : never

/**
 * Type to manipulate the return type using the columns specified
 */
export type ModifyReturn<Context extends QueryContext, Columns extends string> =
  Context extends QueryContext<infer _Database, infer Active, infer _>
    ? ChangeContextReturning<
        Context,
        ToSchema<UnionToTuple<MapColumns<Columns, Active>>>
      >
    : never

export function createSelect<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Table extends string,
>(
  context: Context,
  table: Table,
): SelectBuilder<
  Database,
  ChangeContextReturning<Context, Database["tables"][Table]["columns"]>,
  SelectClause<"*", TableReference<Table>>
> {
  return new DefaultSelectBuilder(
    {
      type: "SelectClause",
      from: {
        type: "TableReference",
        table,
        alias: table,
      },
      columns: "*",
    },
    context,
  ) as unknown as SelectBuilder<
    Database,
    ChangeContextReturning<Context, Database["tables"][Table]["columns"]>,
    SelectClause<"*", TableReference<Table>>
  >
}

export type CheckColumns<Columns extends string> =
  UnionToTuple<BuildColumnReferences<Columns>> extends SelectedColumn[]
    ? BuildSelectColumns<UnionToTuple<BuildColumnReferences<Columns>>>
    : "*"

type BuildSelectColumns<Columns, O = object> = Columns extends [
  infer Head,
  ...infer Rest,
]
  ? Rest extends never[]
    ? Head extends ColumnReference<infer C, infer A>
      ? Flatten<O & { [key in A]: ColumnReference<C, A> }>
      : never
    : Head extends ColumnReference<infer C, infer A>
      ? BuildSelectColumns<
          Rest,
          Flatten<O & { [key in A]: ColumnReference<C, A> }>
        >
      : never
  : never

class DefaultSelectBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Query extends SelectClause,
> implements SelectBuilder<Database, Context, Query>
{
  private _query: Query
  private _context: Context

  constructor(query: Query, context: Context) {
    this._query = query
    this._context = context
  }

  columns<
    Columns extends
      | QueryContextColumns<Context>
      | `${QueryContextColumns<Context>} AS ${string}`,
    Next extends SelectBuilder<
      Database,
      ModifyReturn<Context, Columns>,
      SelectClause<CheckColumns<Columns>, Query["from"]>
    >,
  >(first: CheckColumn<Columns>, ...rest: CheckColumn<Columns>[]): Next {
    this._query.columns = {}
    const columns = [buildColumnReference(first)]

    if (rest !== undefined && rest.length > 0) {
      columns.push(...rest.map((r) => buildColumnReference(r)))
    }

    // Add the columns
    for (const col of columns) {
      Object.defineProperty(this._query.columns, col["alias"], {
        value: col,
        enumerable: true,
      })
    }

    return this as unknown as Next
  }

  where<Exp extends LogicalExpression>(
    builder: (w: WhereClauseBuilder<Context>) => Exp,
  ): AddWhereToAST<SelectBuilder<Database, Context, Query>, Exp> {
    const where: WhereClause<Exp> = {
      where: builder(whereClause(this._context)),
    }

    return new DefaultSelectBuilder(
      { ...this._query, ...where },
      this._context,
    ) as unknown as AddWhereToAST<SelectBuilder<Database, Context, Query>, Exp>
  }

  get ast(): SQLQuery<Query> {
    return {
      type: "SQLQuery",
      query: this._query,
    }
  }
}
