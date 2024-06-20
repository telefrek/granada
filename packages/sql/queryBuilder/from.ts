import type { Keys, StringKeys } from "@telefrek/type-utils"
import type { SQLDatabaseSchema } from "../schema.js"
import {
  QueryContextBuilder,
  type ActivateTableContext,
  type QueryContext,
} from "./context.js"
import { createSelect, type SelectBuilder } from "./select.js"

export function createFrom<Database extends SQLDatabaseSchema>(
  database: Database,
): FromBuilder<Database> {
  return new DefaultFromBuilder(database)
}

export interface FromBuilder<Database extends SQLDatabaseSchema> {
  from<Table extends StringKeys<Database["tables"]>>(
    table: Table,
  ): SelectBuilder<
    Database,
    Table,
    ActivateTableContext<
      Database,
      QueryContext<Database>,
      Table,
      Database["tables"][Table]["columns"]
    >
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
  ): SelectBuilder<
    Database,
    Table,
    ActivateTableContext<
      Database,
      QueryContext<Database>,
      Table,
      Database["tables"][Table]["columns"]
    >
  > {
    return createSelect(
      QueryContextBuilder.create(this._database).copy(table).context,
      table,
    )
  }
}
