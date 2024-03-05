import { PostgresColumnType, PostgresTable } from "./schema"

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

/**
 *
 * @param name The name of the query
 * @param text The query text
 * @returns
 */
export function createQuery(
  name: string,
  text: string,
): PostgresQuery | ParameterizedQuery {
  const parameters: string[] = []

  // Need to parse out all of the parameters from the query
  const tokens = text.split(/[\s,()=]|::+/g).filter(Boolean)

  // Process all the tokens to build a valid string
  for (const token of tokens) {
    // Check if it starts with : and is a valid parameter name
    if (token.startsWith(":")) {
      // Check if the parameter exists
      const idx = parameters.indexOf(token.substring(1))
      if (idx >= 0) {
        text = text.replace(token, `$${idx}`)
      } else {
        parameters.push(token.substring(1))
        text = text.replace(token, `$${parameters.length}`)
      }
    } else if (token.startsWith("$") && parameters.length > 0) {
      throw new Error("Cannot mix named parameters and indices!")
    }
  }

  return parameters.length > 0 ? { name, text, parameters } : { name, text }
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

// We need to consider what is a valid query here as well...
export function bind(
  query: PostgresQuery | ParameterizedQuery,
  args: Record<string, unknown> | [],
): BoundQuery {
  // If we got an array, just pass it through, difficult to validate all cases otherwise
  if (Array.isArray(args)) {
    return {
      ...query,
      args,
    }
  }

  // This should be the most common case
  if (isParameterizedQuery(query)) {
    return {
      ...query,
      args: query.parameters.map((p) => (p in args ? args[p] : undefined)),
    }
  }

  // Assume the object is the only argument, probably should just throw...
  return {
    ...query,
    args: [args],
  }
}

export interface PostgresQueryResult<R extends any = any> {
  hasRows: boolean
  query: PostgresQuery
  rows: R[] | AsyncIterable<R>
}
