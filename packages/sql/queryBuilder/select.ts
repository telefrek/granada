/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SQLTableSchema } from "../schema.js"
import type { QueryContext } from "./context.js"

export interface SelectBuilder<
  Schema extends SQLTableSchema,
  Table extends keyof Schema,
  Context extends QueryContext<any>,
> {
  columns<Columns extends keyof Schema[Table]>(
    first: Columns,
    ...rest: Columns[]
  ): SelectBuilder<Schema, Table, Context>
}
