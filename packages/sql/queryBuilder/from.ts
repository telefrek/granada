/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Flatten, StringKeys } from "@telefrek/type-utils"
import type {
  JoinClause,
  JoinExpression,
  JoinType,
  LogicalExpression,
  NamedQuery,
  SQLQuery,
  SelectClause,
  TableReference,
} from "../ast.js"
import type { SQLDatabaseSchema } from "../schema.js"
import {
  QueryContextBuilder,
  type ActivateTableContext,
  type ContextTable,
  type ContextTables,
  type QueryContext,
  type QueryContextColumns,
} from "./context.js"
import {
  createSelect,
  type CheckAlias,
  type CheckColumns,
  type ModifyReturn,
  type SelectBuilder,
  type SelectColumnsBuilder,
} from "./select.js"
import {
  buildTableReference,
  type AliasedValue,
  type ParseTableReference,
} from "./utils.js"
import { whereClause, type WhereClauseBuilder } from "./where.js"

export function createFrom<Database extends SQLDatabaseSchema>(
  database: Database,
): FromBuilder<Database> {
  return new DefaultFromBuilder(database)
}

type AddJoin<
  Query extends SelectClause,
  Type extends JoinType,
  Table extends TableReference | NamedQuery,
  On extends LogicalExpression,
> =
  Query extends SelectClause<infer Columns, infer From>
    ? Flatten<
        SelectClause<Columns, From> &
          JoinClause<JoinExpression<Type, Table, On>>
      >
    : never

export interface JoinBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Table extends
    | StringKeys<Database["tables"]>
    | AliasedValue<StringKeys<Database["tables"]>>,
  Query extends SelectClause<"*", ParseTableReference<Table>>,
> extends SelectColumnsBuilder<Database, Context, Query> {
  join<
    Type extends JoinType,
    JoinTable extends
      | ContextTables<Context>
      | AliasedValue<ContextTables<Context>>,
    Exp extends LogicalExpression,
  >(
    type: Type,
    table: JoinTable,
    builder: (
      w: WhereClauseBuilder<
        ActivateTableContext<
          Database,
          Context,
          ParseTableReference<JoinTable & string>["alias"],
          ContextTable<
            Context,
            ParseTableReference<JoinTable & string>["table"]
          >
        >
      >,
    ) => Exp,
  ): SelectBuilder<
    Database,
    ActivateTableContext<
      Database,
      Context,
      ParseTableReference<JoinTable & string>["alias"],
      ContextTable<Context, ParseTableReference<JoinTable & string>["table"]>
    >,
    AddJoin<Query, Type, ParseTableReference<JoinTable>, Exp>
  >
}

export interface FromBuilder<Database extends SQLDatabaseSchema> {
  from<
    Table extends
      | StringKeys<Database["tables"]>
      | AliasedValue<StringKeys<Database["tables"]>>,
  >(
    table: CheckAlias<Table>,
  ): JoinBuilder<
    Database,
    ActivateTableContext<
      Database,
      QueryContext<Database>,
      ParseTableReference<Table & string>["alias"],
      Database["tables"][ParseTableReference<
        Table & string
      >["table"]]["columns"]
    >,
    Table,
    SelectClause<"*", ParseTableReference<Table>>
  >
}

class DefaultFromBuilder<Database extends SQLDatabaseSchema>
  implements FromBuilder<Database>
{
  private _database: Database

  constructor(database: Database) {
    this._database = database
  }

  from<
    Table extends
      | StringKeys<Database["tables"]>
      | AliasedValue<StringKeys<Database["tables"]>>,
  >(
    table: CheckAlias<Table>,
  ): JoinBuilder<
    Database,
    ActivateTableContext<
      Database,
      QueryContext<Database>,
      ParseTableReference<Table & string>["alias"],
      Database["tables"][ParseTableReference<
        Table & string
      >["table"]]["columns"]
    >,
    Table,
    SelectClause<"*", ParseTableReference<Table>>
  > {
    return new DefaultJoinBuilder(
      QueryContextBuilder.create(this._database).copy(
        buildTableReference(table) as any,
      ).context,
      table,
    ) as any
  }
}

class DefaultJoinBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Table extends StringKeys<Database["tables"]>,
  Query extends SelectClause<"*", ParseTableReference<Table>>,
> implements JoinBuilder<Database, Context, Table, Query>
{
  private _context: Context
  private _query: Query

  get ast(): SQLQuery<Query> {
    return {
      type: "SQLQuery",
      query: this._query,
    }
  }

  constructor(context: Context, table: Table) {
    this._context = context
    this._query = {
      type: "SelectClause",
      columns: "*",
      from: buildTableReference(table),
    } as Query
  }

  columns<
    Columns extends
      | QueryContextColumns<Context>
      | AliasedValue<QueryContextColumns<Context>>,
    Next extends SelectBuilder<
      Database,
      ModifyReturn<Context, Columns>,
      SelectClause<CheckColumns<Columns>, ParseTableReference<Table>>
    >,
  >(first: CheckAlias<Columns>, ...rest: CheckAlias<Columns>[]): Next {
    const select = createSelect<Database, Context, Query>(
      this._context,
      this._query,
    )

    return select.columns(first as any, ...rest) as unknown as Next
  }

  join<
    Type extends JoinType,
    JoinTable extends
      | ContextTables<Context>
      | AliasedValue<ContextTables<Context>>,
    Exp extends LogicalExpression,
  >(
    type: Type,
    table: JoinTable,
    builder: (
      w: WhereClauseBuilder<
        ActivateTableContext<
          Database,
          Context,
          ParseTableReference<JoinTable & string>["alias"],
          ContextTable<
            Context,
            ParseTableReference<JoinTable & string>["table"]
          >
        >
      >,
    ) => Exp,
  ): SelectBuilder<
    Database,
    ActivateTableContext<
      Database,
      Context,
      ParseTableReference<JoinTable & string>["alias"],
      ContextTable<Context, ParseTableReference<JoinTable & string>["table"]>
    >,
    AddJoin<Query, Type, ParseTableReference<JoinTable>, Exp>
  > {
    const ctx = new QueryContextBuilder<Database, Context>(this._context).copy(
      buildTableReference(table) as any,
    ).context

    const q: AddJoin<Query, Type, ParseTableReference<JoinTable>, Exp> = {
      ...this._query,
      join: {
        type: "JoinClause",
        joinType: type,
        from: buildTableReference(table),
        on: builder(whereClause(ctx)),
      },
    } as any

    return createSelect(ctx, q) as any
  }
}
