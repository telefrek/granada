import type {
  ColumnFilter,
  LogicalTree,
  NamedQuery,
  ParameterValueType,
  QueryClause,
  SQLQuery,
  SelectClause,
  SubQuery,
  SubqueryFilter,
  WhereClause,
  WithClause,
} from "../ast.js"

/**
 * Type representing parameter
 */
export type ParameterInfo<
  Name extends string,
  Column extends string,
  Table extends string,
> = {
  name: Name
  column: Column
  table: Table
}

/**
 * Type to identify all of the query parameters in the given query
 */
export type FindQueryParameters<Q extends SQLQuery> =
  Q extends SQLQuery<infer Query>
    ? Q extends WithClause<infer Queries>
      ? Query extends QueryClause
        ? [...FindWithParameters<Queries>, ...FindQueryClauseParameters<Query>]
        : []
      : Query extends QueryClause
        ? FindQueryClauseParameters<Query>
        : []
    : []

type FindQueryClauseParameters<Q extends QueryClause> =
  Q extends SelectClause<infer _, infer From>
    ? Q extends WhereClause
      ? FindWhereParameters<Q, From["alias"]>
      : []
    : []

type FindWithParameters<T> = T extends [infer With, ...infer Rest]
  ? Rest extends never[]
    ? With extends QueryClause
      ? FindQueryClauseParameters<With>
      : With extends NamedQuery<infer Q, infer _>
        ? FindQueryParameters<Q>
        : []
    : With extends QueryClause
      ? [...FindQueryClauseParameters<With>, ...FindWithParameters<Rest>]
      : With extends NamedQuery<infer Q, infer _>
        ? [...FindQueryParameters<Q>, ...FindWithParameters<Rest>]
        : []
  : []

type FindWhereParameters<W, Table extends string> =
  W extends WhereClause<infer Where>
    ? Where extends LogicalTree<infer _Left, infer _Op, infer _Right>
      ? CollapseTree<RecursivelyExpandTree<[Where]>, Table>
      : FindParameters<Where, Table>
    : []

type RecursivelyExpandTree<T> =
  CheckTreeRecursion<T> extends true ? RecursivelyExpandTree<ExpandTree<T>> : T

type CheckTreeRecursion<T> = T extends [infer Next, ...infer Rest]
  ? Rest extends never[]
    ? Next extends LogicalTree<infer _Left, infer _, infer _Right>
      ? true
      : false
    : Next extends LogicalTree<infer _Left, infer _, infer _Right>
      ? true
      : CheckTreeRecursion<Rest>
  : false

type ExpandTree<T> = T extends [infer Next, ...infer Rest]
  ? Rest extends never[]
    ? Next extends LogicalTree<infer Left, infer _, infer Right>
      ? [Left, Right]
      : [Next]
    : Next extends LogicalTree<infer Left, infer _, infer Right>
      ? [Left, Right, ...ExpandTree<Rest>]
      : [Next, ...ExpandTree<Rest>]
  : []

type CollapseTree<T, Table extends string> = T extends [
  infer Exp,
  ...infer Rest,
]
  ? Rest extends never[]
    ? FindParameters<Exp, Table>
    : [...FindParameters<Exp, Table>, ...CollapseTree<Rest, Table>]
  : []

type FindParameters<E, Table extends string> =
  E extends ColumnFilter<infer _Left, infer _Op, infer Right>
    ? Right extends ParameterValueType<infer Name>
      ? [{ name: Name; column: E["left"]["alias"]; table: Table }] //[ParameterInfo<Name, E["left"]["alias"], Table>]
      : []
    : E extends SubqueryFilter<infer _Column, infer Sub, infer _Op>
      ? Sub extends SubQuery<infer Query>
        ? FindQueryParameters<Query>
        : []
      : []
