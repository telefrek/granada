import { NamedQuery, TableReference } from "../ast.js"

import { ParseSQL } from "./queries.js"

/**
 * Parse the table reference off of the query string
 */
export type ParseTableReference<T> =
  T extends `( ${infer Query} ) AS ${infer Alias}`
    ? NamedQuery<ParseSQL<Query>, Alias>
    : T extends `${infer TableName} AS ${infer Alias}`
      ? TableReference<TableName, Alias>
      : TableReference<T & string>
