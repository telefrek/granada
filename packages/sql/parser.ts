/**
 * Objects that help with parsing SQL into AST or queries
 */

export type SQLQueryKeywords =
  | "AS"
  | "BY"
  | "COLUMNS"
  | "DELETE"
  | "EXCEPT"
  | "FROM"
  | "GROUP"
  | "HAVING"
  | "IN"
  | "INNER"
  | "INTO"
  | "INSERT"
  | "INTERSECT"
  | "JOIN"
  | "LEFT"
  | "LIMIT"
  | "MERGE"
  | "MINUS"
  | "NOT"
  | "OFFSET"
  | "ORDER"
  | "OUTER"
  | "RIGHT"
  | "SELECT"
  | "UNION"
  | "UPDATE"
  | "VALUES"
  | "WHERE"
  | "WITH"

/**
 * Loose steps in my head at this point...
 *
 * 1. Tokenize the query (done)
 * 2. Verify structure is valid via AST translation
 * 3. Verify AST against schema
 *    Note: We may need to manipulate the schema with any projections we find...
 * 4. Generate required parameters (if located) with types
 *
 * After that, we should be able to require the parameters to match for binding
 * to give intellisense on both the query itself and the required syntax for it...
 *
 * This should also allow us to pass/create a typed query that we can pass
 * through to whatever driver we setup for executing (in memory, database, etc.)
 */
