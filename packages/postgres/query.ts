import { PostgresColumnType, PostgresTable } from "./schema.js"

/**
 * Defines a row of a given {@link PostgresTable}
 */
export type PostgresRow<T extends PostgresTable> = {
  [K in keyof T["columns"]]: PostgresColumnType<T["columns"][K]>
}

export interface PostgresQuery {
  name: string
  text: string
}

export interface ParameterizedQuery extends PostgresQuery {
  parameters: string[]
}

export function isParameterizedQuery(
  query: PostgresQuery,
): query is ParameterizedQuery {
  return "parameters" in query && Array.isArray(query.parameters)
}

export interface BoundQuery extends PostgresQuery {
  args: unknown[]
}

export function isBoundQuery(query: PostgresQuery): query is BoundQuery {
  return "args" in query && Array.isArray(query.args)
}

export function bind(
  query: PostgresQuery,
  args: Record<string, unknown> | [],
): BoundQuery {
  // If we got an array, just pass it through, difficult to validate all cases otherwise
  if (Array.isArray(args)) {
    return {
      ...query,
      args,
    }
  }

  const parameters = []
  let text = query.text

  // Need to parse out all of the parameters from the query
  const tokens = query.text.split(/[\s,()=]|::+/g).filter(Boolean)
  for (const token of tokens) {
    // Check if it starts with : and is a valid parameter name
    if (token.startsWith(":")) {
      parameters.push(token.substring(1))
      text = text.replace(token, `$${parameters.length}`)
    } else if (token.startsWith("$") && parameters.length > 0) {
      throw new Error("Cannot mix named parameters and indices!")
    }
  }

  return {
    name: query.name,
    text,
    args: parameters.map((p) => (p in args ? args[p] : undefined)),
  }
}

export interface PostgresQueryResult<
  T extends PostgresTable,
  R extends Partial<PostgresRow<T>>,
> {
  hasRows: boolean
  query: PostgresQuery
  rows: R[] | AsyncIterable<R>
}
