/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { Inc } from "@telefrek/type-utils/numeric.js"

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
export type FindQueryParameters<Q extends SQLQuery<any>> =
  Q extends SQLQuery<infer Query>
    ? Q extends WithClause<infer Queries>
      ? [...FindWithParameters<Queries>, ...FindQueryClauseParameters<Query>]
      : FindQueryClauseParameters<Query>
    : []

type FindQueryClauseParameters<Q extends QueryClause> =
  Q extends SelectClause<infer _, infer From>
    ? Q extends WhereClause<any>
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
      ? CollapseTree<ExpandTree<Where>, Table>
      : FindParameters<Where, Table>
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
      ? [ParameterInfo<Name, E["left"]["alias"], Table>]
      : []
    : E extends SubqueryFilter<infer _Column, infer Sub, infer _Op>
      ? Sub extends SubQuery<infer Query>
        ? FindQueryParameters<Query>
        : []
      : []

type ExpandTree<T extends LogicalTree<any>, N extends number = 0> = N extends 2
  ? []
  : T extends LogicalTree<infer Left, infer _, infer Right>
    ? Left extends LogicalTree<infer _L1, infer _, infer _R1>
      ? Right extends LogicalTree<infer _L2, infer _, infer _R2>
        ? [...ExpandTree<Left, Inc<N>>, ...ExpandTree<Right, Inc<N>>]
        : [...ExpandTree<Left, Inc<N>>, Right]
      : Right extends LogicalTree<infer _L2, infer _, infer _R2>
        ? [Left, ...ExpandTree<Right, Inc<N>>]
        : [Left, Right]
    : []
