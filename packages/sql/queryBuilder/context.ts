/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */

import type { Flatten, IsUnion, Keys } from "@telefrek/type-utils/index.js"
import {
  columnSchemaBuilder,
  type ColumnSchemaManager,
  type SQLColumnSchema,
  type SQLDatabaseSchema,
  type SQLDatabaseTables,
  type SQLTableSchema,
} from "../schema.js"

/**
 * The current context available for a query
 *
 * @template Database The original database schema
 * @template Active The active schema for this query
 * @template Returning The resulting shape of the context
 */
export type QueryContext<
  Database extends SQLDatabaseSchema,
  Active extends SQLDatabaseTables = {},
  Returning extends SQLColumnSchema | number = number,
> = {
  database: Database
  active: Active
  returning: Returning
}

/**
 * Retrieve the valid column values with type aliasing as necessary for
 * duplicated names
 *
 * @template Context The query context to use for finding values
 */
export type QueryContextColumns<Context extends QueryContext<any, any, any>> =
  Context extends QueryContext<infer _Database, infer Active, infer _Returning>
    ? IsUnion<Keys<Active>> extends true
      ? TableColumns<Active>
      : {
          [Key in Keys<Active>]: `${Keys<Active[Key]["columns"]> & string}`
        }[Keys<Active>]
    : never

/**
 * Utility type to find all the columns with names that are non-unique and
 * require a table alias
 *
 * @template Tables The tables that are available to inspect
 */
type TableColumns<Tables extends SQLDatabaseTables> = {
  [T in Keys<Tables>]: {
    [C in Keys<Tables[T]["columns"]>]: [C] extends [UniqueColumns<Tables>]
      ? `${C & string}`
      : `${T & string}.${C & string}`
  }[Keys<Tables[T]["columns"]>]
}[Keys<Tables>]

/**
 * Finds the unique columns across the tables
 *
 * @template Tables The tables that are available to inspect
 */
type UniqueColumns<Tables extends SQLDatabaseTables> = {
  [T in Keys<Tables>]: Unique<
    keyof Tables[T]["columns"],
    OtherColumns<Tables, T>
  >
}[Keys<Tables>]

/**
 * Utility type to find unique values that are in left but not right
 *
 * @template Left The values to find unique values from
 * @template Right The values to check against for uniqueness
 */
type Unique<
  Left extends string | number | symbol,
  Right extends string | number | symbol,
> = {
  [v in Left]: [v] extends [Right] ? never : v
}[Left]

/**
 * Utility type to locate all the columns in other tables
 *
 * @template Tables The current set of tables
 * @template Name The name of the table to exclude
 */
type OtherColumns<
  Tables extends SQLDatabaseTables,
  Name extends keyof Tables,
> = {
  [Key in Keys<Tables>]: [Key] extends [Name]
    ? never
    : keyof Tables[Key]["columns"]
}[Keys<Tables>]

/**
 * Helper for building {@link QueryContext} instances
 *
 * @template Context The current shape of the query context
 */
export class QueryContextBuilder<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database, any, any>,
> {
  /**
   * Create a context builder for the given schema
   *
   * @param schema The Schema to use
   * @returns A new context builder
   *
   * @template DB The database schema to use
   */
  static create<DB extends SQLDatabaseSchema>(schema: DB) {
    return new QueryContextBuilder<DB, QueryContext<DB>>({
      database: schema,
      active: {},
      returning: 0,
    })
  }

  private _context: Context
  constructor(context: Context) {
    this._context = context
  }

  /**
   * Retrieve the current Context
   */
  get context(): Context {
    return this._context
  }

  /**
   * Add a table with the given definition to the context
   *
   * @param table The table to add
   * @param builder The function to use for building the table or schema
   * @returns An updated context builder
   */
  add<Table extends string, Updated extends SQLColumnSchema>(
    table: CheckDuplicateTable<Table, Context>,
    builder: ColumnSchemaManager<{}, Updated> | Updated,
  ): QueryContextBuilder<
    Database,
    AddTableToContext<Database, Context, Table, Updated>
  > {
    // Modify the schema
    const schema =
      typeof builder === "function"
        ? builder(columnSchemaBuilder({})).schema
        : builder

    // Add the table
    Object.defineProperty(this._context["active"], table, { value: schema })

    // Ignore the typing we know it is correct here
    return this as any
  }

  /**
   * Copy the schema from the database into the active set
   *
   * @param table The table to copy the definition from
   * @returns An updated context builder
   *
   * @template Table The table from the database to copy
   */
  copy<Table extends keyof Database["tables"]>(
    table: CheckDuplicateTable<Table & string, Context>,
  ): QueryContextBuilder<
    Database,
    AddTableToContext<
      Database,
      Context,
      Table & string,
      Database["tables"][Table]["columns"]
    >
  > {
    return this.add(
      table,
      this._context["database"]["tables"][table]["columns"],
    )
  }

  /**
   * Update the return type of the context
   *
   * @param schema The schema for the return type
   * @returns An updated context
   *
   * @template Schema The new return schema
   */
  returning<Schema extends SQLColumnSchema>(
    schema: Schema,
  ): QueryContextBuilder<
    Database,
    AddReturnToContext<Database, Context, Schema>
  > {
    Object.defineProperty(this._context, "returning", { value: schema })

    return this as any
  }
}

/**
 * Verifies the table name is not already in the active set
 *
 * @template Table The table name to check
 * @template Context The current context to check against
 */
type CheckDuplicateTable<
  Table extends string,
  Context extends QueryContext<any>,
> =
  Context extends QueryContext<infer _Database, infer Active, infer _Returning>
    ? Table extends keyof Active
      ? never
      : Table
    : Table

/**
 * Add the return type to the context
 *
 * @template Database The database being used
 * @template Context The current context
 * @template Returning The desired return type
 */
type AddReturnToContext<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Returning extends SQLColumnSchema,
> =
  Context extends QueryContext<Database, infer Active, infer _>
    ? QueryContext<Database, Active, Returning>
    : never

/**
 * Add the table to the active portion of the context
 *
 * @template Database The current database
 * @template Context The current context
 * @template Table The table name to add
 * @template Schema The schema for the table
 */
type AddTableToContext<
  Database extends SQLDatabaseSchema,
  Context extends QueryContext<Database>,
  Table extends string,
  Schema extends SQLColumnSchema,
> =
  Context extends QueryContext<Database, infer Active, infer Returning>
    ? Active extends SQLDatabaseTables
      ? QueryContext<
          Database,
          Flatten<Active & { [key in Table]: SQLTableSchema<Schema> }>,
          Returning
        >
      : never
    : never
