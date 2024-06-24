/**
 * Set of utilities to validate a query against a schema
 */

import type {
  ColumnReference,
  JoinClause,
  NamedQuery,
  SQLQuery,
  SelectClause,
  SelectColumns,
  TableReference,
  WhereClause,
} from "./ast.js"
import { queryBuilder, type QueryBuilder } from "./builder.js"
import type { NormalizeQuery } from "./parsing/normalization.js"
import type { ParseSQL } from "./parsing/queries.js"
import type { SQLDatabaseSchema } from "./schema.js"

/**
 * Things to do
 *
 * - Fix where clause id=1 parsing, etc
 * - Add more tests for structure
 * - Verify columns on select
 * - Parse insert/update/delete
 * - Add aggregation methods to columns
 * - Add in unions, etc
 */

/**
 * Parse a SQLQuery type from the given query string
 */
export type ParseSQLQuery<Query extends string> = ParseSQL<
  NormalizeQuery<Query>
>

/**
 * Class to help with Query parsing
 */
export class QueryParser<Database extends SQLDatabaseSchema> {
  private _database: Database

  constructor(database: Database) {
    this._database = database
  }

  get builder(): QueryBuilder<Database> {
    return queryBuilder(this._database)
  }

  parse<T extends string>(query: T): ParseSQLQuery<T> {
    return parseQueryClause(normalize(query)) as ParseSQLQuery<T>
  }
}

function parseQueryClause(s: string): SQLQuery {
  const tokens = s.split(" ")
  switch (tokens.shift()!) {
    case "SELECT":
      return {
        type: "SQLQuery",
        query: parseSelect(tokens),
      }
    default:
      throw new Error(`Cannot parse ${s}`)
  }
}

function parseSelect(tokens: string[]): SelectClause {
  return {
    type: "SelectClause",
    ...parseColumns(takeUntil(tokens, ["FROM"])),
    ...parseFrom(takeUntil(tokens, FROM_KEYS)),
    ...parseJoin(takeUntil(tokens, WHERE_KEYS)),
    ...parseWhere(tokens),
  }
}

function parseColumns(tokens: string[]): { columns: SelectColumns | "*" } {
  const columns = tokens.join(" ").split(" , ")

  if (columns.length === 0 && columns[0] === "*") {
    return {
      columns: "*",
    }
  }

  return {
    columns: columns
      .map((c) => parseColumnReference(c))
      .reduce((v, r) => {
        Object.defineProperty(v, r.alias, { enumerable: true, value: r })
        return v
      }, {}),
  }
}

function parseColumnReference(s: string): ColumnReference {
  const aData = s.split(" AS ")
  const cData = aData[0].split(".")

  const table = cData.length > 1 ? cData[0] : undefined
  const column = cData.length > 1 ? cData[1] : cData[0]
  const alias = aData.length > 1 ? aData[1] : column

  return {
    type: "ColumnReference",
    reference:
      table === undefined
        ? {
            type: "UnboundColumnReference",
            column,
          }
        : {
            type: "TableColumnReference",
            table,
            column,
          },
    alias,
  }
}

function parseFrom(tokens: string[]): { from: TableReference | NamedQuery } {
  tokens.shift()
  return {
    from: parseTableReference(tokens.join(" ")),
  }
}

function parseJoin(_tokens: string[]): { join?: JoinClause } {
  return {}
}

function parseWhere(_tokens: string[]): { where?: WhereClause } {
  return {}
}

function parseTableReference(table: string): TableReference {
  if (table.indexOf(" AS ") > 0) {
    const data = table.split(" AS ")
    return {
      type: "TableReference",
      table: data[0],
      alias: data[1],
    }
  }

  return {
    type: "TableReference",
    table,
    alias: table,
  }
}

function takeUntil(tokens: string[], filters: string[]): string[] {
  const ret = []

  let cnt = 0

  while (tokens.length > 0 && filters.indexOf(tokens[0]) < 0 && cnt === 0) {
    const token = tokens.shift()!
    ret.push(token)
    if (token === "(") {
      cnt++
    } else if (token === ")") {
      cnt--
    }
  }

  return ret
}

function normalize<T extends string>(s: T): NormalizeQuery<T> {
  return s
    .split(/ |\n|(?=[,()])|(?<=[,()])/g)
    .filter((s) => s.length > 0)
    .map((s) => normalizeWord(s.trim()))
    .join(" ") as NormalizeQuery<T>
}

function normalizeWord(s: string): string {
  return NORMALIZE_TARGETS.indexOf(s.toUpperCase()) < 0 ? s : s.toUpperCase()
}

const QUERY_KEYS = ["SELECT", "UPDATE", "INSERT", "DELETE", "WITH"]

const WHERE_KEYS = ["HAVING", "ORDER", "BY", "LIMIT", "OFFSET"]

const JOIN_KEYS = [
  "JOIN",
  "OUTER",
  "INNER",
  "FULL",
  "LEFT",
  "RIGHT",
  "LATERAL",
  "ON",
]

const FROM_KEYS = ["WHERE", ...WHERE_KEYS, ...JOIN_KEYS]

const NORMALIZE_TARGETS = [
  ...QUERY_KEYS,
  ...FROM_KEYS,
  "FROM",
  "AS",
  "UNION",
  "EXTRACT",
  "INTERSECT",
  "AND",
  "OR",
  "NOT",
]
