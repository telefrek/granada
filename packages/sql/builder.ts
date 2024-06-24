/**
 * Handles building AST queries
 */

import { createFrom, type FromBuilder } from "./queryBuilder/from.js"
import type { SQLDatabaseSchema } from "./schema.js"

export function queryBuilder<Database extends SQLDatabaseSchema>(
  database: Database,
): QueryBuilder<Database> {
  return new DefaultQueryBuilder(database)
}

export interface QueryBuilder<Database extends SQLDatabaseSchema> {
  select: FromBuilder<Database>
}

class DefaultQueryBuilder<Database extends SQLDatabaseSchema>
  implements QueryBuilder<Database>
{
  private _database: Database

  constructor(database: Database) {
    this._database = database
  }

  get select(): FromBuilder<Database> {
    return createFrom(this._database)
  }
}
