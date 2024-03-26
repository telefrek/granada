/**
 * Extensions for creating relational queries
 */

import type {
  AliasedType,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils.js"
import type { RelationalDataStore, RelationalDataTable, STAR } from ".."
import {
  ExecutionMode,
  QueryParameters,
  QueryType,
  type BuildableQueryTypes,
  type ParameterizedQuery,
  type QueryBuilder,
  type SimpleQuery,
} from "../../index"
import {
  RelationalNodeType,
  type FilterGroup,
  type FilterTypes,
  type RelationalQueryNode,
  type TableAlias,
} from "../ast"
import {
  type ArrayItemType,
  type ArrayProperty,
  type MergedNonOverlappingType,
  type ModifiedStore,
  type PropertyOfType,
} from "../types"
import { DefaultRelationalNodeBuilder } from "./internal"

export function useDataStore<
  D extends RelationalDataStore,
>(): RelationalNodeBuilder<D, QueryType.SIMPLE> {
  return new DefaultRelationalNodeBuilder(QueryType.SIMPLE)
}

interface RelationalNodeProcessor<
  D extends RelationalDataStore,
  Q extends BuildableQueryTypes,
  T extends RelationalDataTable,
  P extends QueryParameters,
> {
  tableName?: keyof D["tables"]

  asNode(): RelationalQueryNode<RelationalNodeType>

  build(
    builder: QueryBuilder<Q, T, P>,
    name: string,
    mode?: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<T> : ParameterizedQuery<T, P>
}

export interface RelationalNodeBuilder<
  D extends RelationalDataStore,
  Q extends BuildableQueryTypes = QueryType.SIMPLE,
  R extends RelationalDataTable = never,
  P extends QueryParameters = never,
  A extends keyof D["tables"] = never,
> extends RelationalNodeProcessor<D, Q, R, P> {
  queryType: Q
  context: RelationalQueryNode<RelationalNodeType> | undefined
  tableAlias: TableAlias

  withParameters<QP extends QueryParameters>(): RelationalNodeBuilder<
    D,
    QueryType.PARAMETERIZED,
    R,
    QP,
    A
  >

  withTableAlias<TN extends keyof Omit<D["tables"], A>, Alias extends string>(
    table: TN,
    alias: Alias,
  ): RelationalNodeBuilder<
    ModifiedStore<D, Alias, D["tables"][TN]>,
    Q,
    R,
    P,
    A | Alias
  >

  withCte<Alias extends string, TT extends RelationalDataTable>(
    alias: Alias,
    source: RelationalProcessorBuilder<D, Q, R, P, A, TT>,
  ): RelationalNodeBuilder<ModifiedStore<D, Alias, TT>, Q, R, P, A | Alias>

  select<T extends keyof D["tables"]>(
    tableName: T,
  ): TableNodeBuilder<D, T, D["tables"][T], P, Q>

  insert<T extends keyof D["tables"]>(
    tableName: T,
  ): InsertBuilder<D, T, never, D["tables"][T]>
}

export interface InsertBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  P extends RequiredLiteralKeys<D["tables"][T]>,
> extends RelationalNodeProcessor<D, QueryType.PARAMETERIZED, R, P> {
  returning(columns: STAR): InsertBuilder<D, T, D["tables"][T], P>
  returning<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): InsertBuilder<D, T, Pick<D["tables"][T], C>, P>
}

export type RelationalProcessorBuilder<
  D extends RelationalDataStore,
  Q extends BuildableQueryTypes,
  T extends RelationalDataTable,
  P extends QueryParameters,
  A extends keyof D["tables"],
  TT extends RelationalDataTable,
> = (
  builder: RelationalNodeBuilder<D, Q, T, P, A>,
) => RelationalNodeProcessor<D, Q, TT, P>

type ParameterOrValue<
  T extends RelationalDataTable,
  C extends keyof T,
  P extends QueryParameters,
> = [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>

export type TableGenerator<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
  TR extends RelationalDataTable = D["tables"][T],
> = (
  from: TableNodeBuilder<D, T, TR, P, Q>,
) => RelationalNodeProcessor<D, Q, R, P>

export interface JoinNodeBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
> extends RelationalNodeProcessor<D, Q, R, P> {
  join<
    JT extends T & string,
    JTB extends keyof Exclude<D["tables"], T> & string,
    TT extends RelationalDataTable,
  >(
    target: JT,
    joinTable: JTB,
    tableGenerator: TableGenerator<D, JTB, TT, P, Q>,
    leftColumn: keyof D["tables"][JT] & string,
    rightColumn: keyof D["tables"][JTB] & string,
  ): JoinNodeBuilder<D, T | JTB, MergedNonOverlappingType<R, TT>, P, Q>
}

export interface TableNodeBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R extends RelationalDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
> extends RelationalNodeProcessor<D, Q, R, P> {
  tableName: T
  builder: RelationalNodeBuilder<
    D,
    Q,
    RelationalDataTable,
    P,
    keyof D["tables"]
  >
  tableAlias?: keyof D["tables"]

  columns(column: STAR): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns">
  columns<C extends Extract<keyof D["tables"][T], string>>(
    ...columns: C[]
  ): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns">

  join<JT extends keyof D["tables"], JR extends RelationalDataTable>(
    joinTable: JT,
    tableGenerator: TableGenerator<D, JT, JR, P, Q>,
    leftColumn: keyof D["tables"][T],
    rightColumn: keyof D["tables"][JT],
  ): JoinNodeBuilder<D, JT | T, MergedNonOverlappingType<R, JR>, P, Q>

  withColumnAlias<
    C extends keyof R & keyof D["tables"][T] & string,
    Alias extends string,
  >(
    column: C,
    alias: Alias,
  ): TableNodeBuilder<D, T, AliasedType<R, C, Alias>, P, Q>

  where(
    clause: (
      builder: WhereClauseBuilder<D["tables"][T], Q, P>,
    ) => WhereClauseBuilder<D["tables"][T], Q, P>,
  ): Omit<TableNodeBuilder<D, T, R, P, Q>, "where">
}

export interface WhereClauseBuilder<
  T extends RelationalDataTable,
  Q extends BuildableQueryTypes,
  P extends QueryParameters = never,
> {
  eq<C extends keyof T>(
    column: C,
    value: ParameterOrValue<T, C, P>,
  ): WhereClauseBuilder<T, Q, P>

  gt<C extends keyof T>(
    column: C,
    value: ParameterOrValue<T, C, P>,
  ): WhereClauseBuilder<T, Q, P>

  gte<C extends keyof T>(
    column: C,
    value: ParameterOrValue<T, C, P>,
  ): WhereClauseBuilder<T, Q, P>

  lt<C extends keyof T>(
    column: C,
    value: ParameterOrValue<T, C, P>,
  ): WhereClauseBuilder<T, Q, P>

  lte<C extends keyof T>(
    column: C,
    value: ParameterOrValue<T, C, P>,
  ): WhereClauseBuilder<T, Q, P>

  and(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P>

  or(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P>

  not(...clauses: WhereClauseBuilder<T, Q, P>[]): WhereClauseBuilder<T, Q, P>

  contains<C extends PropertyOfType<T, string>>(
    column: C,
    value: ParameterOrValue<T, C, P>,
  ): WhereClauseBuilder<T, Q, P>

  containsItems<C extends ArrayProperty<T>>(
    column: C,
    value: [P] extends [never]
      ? T[C] | ArrayItemType<T, C>
      : PropertyOfType<P, T[C]>,
  ): WhereClauseBuilder<T, Q, P>

  current?: FilterGroup | FilterTypes
  queryType: Q
}
