/**
 * Set of utilities to validate a query against a schema
 */

import type {
  ColumnAssignment,
  ColumnReference,
  StringValueType,
  TableColumnReference,
  TableReference,
  UnboundColumnReference,
  UpdateClause,
} from "./ast.js"

// NOTE: Assume all keywords are uppercase or all lowercase or this fails...

export type ExtractSQLQuery<Query extends string> =
  | ExtractUpdateClause<Query>
  | ExtractDeleteClause<Query>

type ExtractDeleteClause<T> =
  T extends `DELETE ${infer Table} WHERE ${infer Where} RETURNING ${infer Returning}`
    ? { type: "DeleteClause"; table: Table; where: Where; returning: Returning }
    : T extends `delete ${infer Table} where ${infer Where} returning ${infer Returning}`
      ? {
          type: "DeleteClause"
          table: Table
          where: Where
          returning: Returning
        }
      : T extends `DELETE ${infer Table} RETURNING ${infer Returning}`
        ? { type: "DeleteClause"; table: Table; returning: Returning }
        : T extends `delete ${infer Table} returning ${infer Returning}`
          ? { type: "DeleteClause"; table: Table; returning: Returning }
          : T extends `DELETE ${infer Table} WHERE ${infer Where}`
            ? { type: "DeleteClause"; table: Table; where: Where }
            : T extends `delete ${infer Table} where ${infer Where}`
              ? { type: "DeleteClause"; table: Table; where: Where }
              : T extends `DELETE ${infer Table}`
                ? { type: "DeleteClause"; table: Table }
                : T extends `delete ${infer Table}`
                  ? { type: "DeleteClause"; table: Table }
                  : never

type ExtractUpdateClause<T> =
  T extends `UPDATE ${infer Table} SET ${infer Fields} WHERE ${infer Where} RETURNING ${infer Returning}`
    ? UpdateClause<
        TableReference<Table>,
        ExtractColumnAssignment<Fields>,
        ExtractWhereClause<Where>,
        ExtractReturning<Table, Returning>
      >
    : T extends `update ${infer Table} set ${infer Fields} where ${infer Where} returning ${infer Returning}`
      ? UpdateClause<
          TableReference<Table>,
          ExtractColumnAssignment<Fields>,
          ExtractWhereClause<Where>,
          ExtractReturning<Table, Returning>
        >
      : T extends `UPDATE ${infer Table} SET ${infer Fields} WHERE ${infer Where}`
        ? UpdateClause<
            TableReference<Table>,
            ExtractColumnAssignment<Fields>,
            ExtractWhereClause<Where>,
            never
          >
        : T extends `update ${infer Table} set ${infer Fields} where ${infer Where}`
          ? UpdateClause<
              TableReference<Table>,
              ExtractColumnAssignment<Fields>,
              ExtractWhereClause<Where>,
              never
            >
          : T extends `UPDATE ${infer Table} SET ${infer Fields} RETURNING ${infer Returning}`
            ? UpdateClause<
                TableReference<Table>,
                ExtractColumnAssignment<Fields>,
                never,
                ExtractReturning<Table, Returning>
              >
            : T extends `update ${infer Table} set ${infer Fields} returning ${infer Returning}`
              ? UpdateClause<
                  TableReference<Table>,
                  ExtractColumnAssignment<Fields>,
                  never,
                  ExtractReturning<Table, Returning>
                >
              : T extends `UPDATE ${infer Table} SET ${infer Fields}`
                ? UpdateClause<
                    TableReference<Table>,
                    ExtractColumnAssignment<Fields>,
                    never,
                    never
                  >
                : T extends `update ${infer Table} set ${infer Fields}`
                  ? UpdateClause<
                      TableReference<Table>,
                      ExtractColumnAssignment<Fields>,
                      never,
                      never
                    >
                  : never

type ExtractColumnAssignment<T> = T extends `${infer Field}=${infer Value}`
  ? [
      ColumnAssignment<
        ColumnReference<UnboundColumnReference<Field & string>, Field & string>,
        StringValueType<Value>
      >,
    ]
  : never

type ExtractReturning<Table, T> = T extends string
  ? [TableColumnReference<Table & string, T>]
  : never

type ExtractWhereClause<T> = T extends string ? StringValueType<T> : never

/**
 * Set of keywords we use for detecting syntax
 */
export type SQLQueryKeywords =
  | "AS"
  | "as"
  | "BY"
  | "by"
  | "COLUMNS"
  | "columns"
  | "DELETE"
  | "delete"
  | "EXCEPT"
  | "except"
  | "FROM"
  | "from"
  | "GROUP"
  | "group"
  | "HAVING"
  | "having"
  | "IN"
  | "in"
  | "INNER"
  | "inner"
  | "INTO"
  | "into"
  | "INSERT"
  | "insert"
  | "INTERSECT"
  | "intersect"
  | "JOIN"
  | "join"
  | "LEFT"
  | "left"
  | "LIMIT"
  | "limit"
  | "MERGE"
  | "merge"
  | "MINUS"
  | "minus"
  | "NOT"
  | "not"
  | "OFFSET"
  | "offset"
  | "ORDER"
  | "order"
  | "OUTER"
  | "outer"
  | "RIGHT"
  | "right"
  | "SELECT"
  | "select"
  | "UNION"
  | "union"
  | "UPDATE"
  | "update"
  | "VALUES"
  | "values"
  | "WHERE"
  | "where"
  | "WITH"
  | "with"

/**
 * Trim the leading whitespace characters
 */
type Trim<T> = T extends ` ${infer Rest}`
  ? Trim<Rest>
  : T extends `\n${infer Rest}`
    ? Trim<Rest>
    : T

/**
 * Split the current remainder into the next two tokens
 */
type Split<T> =
  Trim<T> extends `${infer Left} ${infer Right}`
    ? [Left, Right]
    : Trim<T> extends `${infer Left}\n${infer Right}`
      ? [Left, Right]
      : Trim<T> extends `${infer Left},${infer Right}`
        ? [Left, Right]
        : Trim<T> extends `${infer Left})`
          ? [Left, ")"]
          : Trim<T> extends `(${infer Right}`
            ? ["(", Right]
            : [Trim<T>, ""]
