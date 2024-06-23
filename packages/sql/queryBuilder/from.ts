import type { Flatten, Keys, StringKeys } from "@telefrek/type-utils"
import type {
  JoinClause,
  JoinExpression,
  JoinType,
  LogicalExpression,
  NamedQuery,
  SelectClause,
  TableReference,
} from "../ast.js"
import type { SQLDatabaseSchema } from "../schema.js"
import {
  QueryContextBuilder,
  type ActivateTableContext,
  type QueryContext,
  type QueryContextColumns,
} from "./context.js"
import {
  createSelect,
  type CheckColumn,
  type CheckColumns,
  type ModifyReturn,
  type SelectBuilder,
  type SelectColumnsBuilder,
} from "./select.js"
import type { WhereClauseBuilder } from "./where.js"

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
  Table extends StringKeys<Database["tables"]>,
  Query extends SelectClause<"*", TableReference<Table>>,
> extends SelectColumnsBuilder<Database, Context, Query["from"]> {
  join<
    Type extends JoinType,
    JoinTable extends StringKeys<Database["tables"]>,
    Exp extends LogicalExpression,
  >(
    type: Type,
    table: JoinTable,
    builder: (w: WhereClauseBuilder<Context>) => Exp,
  ): SelectBuilder<
    Database,
    Context,
    AddJoin<Query, Type, TableReference<Table>, Exp>
  >
}

export interface FromBuilder<Database extends SQLDatabaseSchema> {
  from<Table extends StringKeys<Database["tables"]>>(
    table: Table,
  ): JoinBuilder<
    Database,
    ActivateTableContext<
      Database,
      QueryContext<Database>,
      Table,
      Database["tables"][Table]["columns"]
    >,
    Table,
    SelectClause<"*", TableReference<Table>>
  >
}

class DefaultFromBuilder<Database extends SQLDatabaseSchema>
  implements FromBuilder<Database>
{
  private _database: Database

  constructor(database: Database) {
    this._database = database
  }

  from<Table extends Extract<Keys<Database["tables"]>, string>>(
    table: Table,
  ): JoinBuilder<
    Database,
    ActivateTableContext<
      Database,
      QueryContext<Database>,
      Table,
      Database["tables"][Table]["columns"]
    >,
    Table,
    SelectClause<"*", TableReference<Table>>
  > {
    return new DefaultJoinBuilder(
      QueryContextBuilder.create(this._database).copy(table).context,
      table,
    )
  }
}

class DefaultJoinBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Table extends StringKeys<Database["tables"]>,
  Query extends SelectClause<"*", TableReference<Table>>,
> implements JoinBuilder<Database, Context, Table, Query>
{
  private _context: Context
  private _table: Table

  constructor(context: Context, table: Table) {
    this._context = context
    this._table = table
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
    const select = createSelect(this._context, this._table) as SelectBuilder<
      Database,
      Context,
      Query
    >
    return select.columns(first, ...rest)
  }

  join<
    Type extends JoinType,
    JoinTable extends StringKeys<Database["tables"]>,
    Exp extends LogicalExpression,
  >(
    type: Type,
    table: JoinTable,
    builder: (w: WhereClauseBuilder<Context>) => Exp,
  ): SelectBuilder<
    Database,
    Context,
    AddJoin<Query, Type, TableReference<Table>, Exp>
  > {
    return createSelect(this._context, this._table) as SelectBuilder<
      Database,
      Context,
      AddJoin<Query, Type, TableReference<Table>, Exp>
    >
  }
}
