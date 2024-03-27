/**
 * Extensions for creating sql queries
 */

import type {
  AliasedType,
  ArrayItemType,
  ArrayProperty,
  MatchingProperty,
  MergedNonOverlappingType,
  PropertyOfType,
  RequiredLiteralKeys,
} from "@telefrek/core/type/utils"
import type { SQLDataStore, SQLDataTable, STAR } from ".."
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
  SQLNodeType,
  type FilterGroup,
  type FilterTypes,
  type SQLQueryNode,
  type TableAlias,
} from "../ast"
import { DefaultSQLNodeBuilder } from "./internal"

/**
 * A modiefied {@link SQLDataStore} with a new key and table definition
 */
export interface ModifiedStore<
  Left extends SQLDataStore,
  N extends string,
  RowType extends SQLDataTable,
> {
  tables: {
    [key in keyof Left["tables"] | N]: key extends keyof Left["tables"]
      ? Left["tables"][key]
      : RowType
  }
}

export function useDataStore<D extends SQLDataStore>(): SQLNodeBuilder<
  D,
  QueryType.SIMPLE
> {
  return new DefaultSQLNodeBuilder(QueryType.SIMPLE)
}

interface SQLNodeProcessor<
  D extends SQLDataStore,
  Q extends BuildableQueryTypes,
  T extends SQLDataTable,
  P extends QueryParameters,
> {
  tableName?: keyof D["tables"]

  asNode(): SQLQueryNode<SQLNodeType>

  build(
    builder: QueryBuilder<Q, T, P>,
    name: string,
    mode?: ExecutionMode,
  ): [P] extends [never] ? SimpleQuery<T> : ParameterizedQuery<T, P>
}

export interface SQLNodeBuilder<
  D extends SQLDataStore,
  Q extends BuildableQueryTypes = QueryType.SIMPLE,
  R extends SQLDataTable = never,
  P extends QueryParameters = never,
  A extends keyof D["tables"] = never,
> extends SQLNodeProcessor<D, Q, R, P> {
  queryType: Q
  context: SQLQueryNode<SQLNodeType> | undefined
  tableAlias: TableAlias

  withParameters<QP extends QueryParameters>(): SQLNodeBuilder<
    D,
    QueryType.PARAMETERIZED,
    R,
    QP,
    A
  >

  withTableAlias<TN extends keyof Omit<D["tables"], A>, Alias extends string>(
    table: TN,
    alias: Alias,
  ): SQLNodeBuilder<
    ModifiedStore<D, Alias, D["tables"][TN]>,
    Q,
    R,
    P,
    A | Alias
  >

  withCte<Alias extends string, TT extends SQLDataTable>(
    alias: Alias,
    source: SQLProcessorBuilder<D, Q, R, P, A, TT>,
  ): SQLNodeBuilder<ModifiedStore<D, Alias, TT>, Q, R, P, A | Alias>

  select<T extends keyof D["tables"]>(
    tableName: T,
  ): TableNodeBuilder<D, T, D["tables"][T], P, Q>

  insert<T extends keyof D["tables"]>(
    tableName: T,
  ): InsertBuilder<D, T, never, D["tables"][T]>
}

export interface InsertBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends RequiredLiteralKeys<D["tables"][T]>,
> extends SQLNodeProcessor<D, QueryType.PARAMETERIZED, R, P> {
  returning(columns: STAR): InsertBuilder<D, T, D["tables"][T], P>
  returning<C extends keyof D["tables"][T]>(
    ...columns: C[]
  ): InsertBuilder<D, T, Pick<D["tables"][T], C>, P>
}

export type SQLProcessorBuilder<
  D extends SQLDataStore,
  Q extends BuildableQueryTypes,
  T extends SQLDataTable,
  P extends QueryParameters,
  A extends keyof D["tables"],
  TT extends SQLDataTable,
> = (builder: SQLNodeBuilder<D, Q, T, P, A>) => SQLNodeProcessor<D, Q, TT, P>

type ParameterOrValue<
  T extends SQLDataTable,
  C extends keyof T,
  P extends QueryParameters,
> = [P] extends [never] ? T[C] : PropertyOfType<P, T[C]>

export type TableGenerator<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
  TR extends SQLDataTable = D["tables"][T],
> = (from: TableNodeBuilder<D, T, TR, P, Q>) => SQLNodeProcessor<D, Q, R, P>

export interface JoinNodeBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
> extends SQLNodeProcessor<D, Q, R, P> {
  join<
    JT extends T & string,
    JTB extends keyof Exclude<D["tables"], T> & string,
    TT extends SQLDataTable,
    LC extends keyof D["tables"][JT] & string,
  >(
    target: JT,
    joinTable: JTB,
    tableGenerator: TableGenerator<D, JTB, TT, P, Q>,
    leftColumn: LC,
    rightColumn: MatchingProperty<D["tables"][JT], D["tables"][JT], LC> &
      string,
  ): JoinNodeBuilder<D, T | JTB, MergedNonOverlappingType<R, TT>, P, Q>
}

export interface TableNodeBuilder<
  D extends SQLDataStore,
  T extends keyof D["tables"],
  R extends SQLDataTable,
  P extends QueryParameters,
  Q extends BuildableQueryTypes,
> extends SQLNodeProcessor<D, Q, R, P> {
  tableName: T
  builder: SQLNodeBuilder<D, Q, SQLDataTable, P, keyof D["tables"]>
  tableAlias?: keyof D["tables"]

  columns(column: STAR): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns">
  columns<C extends Extract<keyof D["tables"][T], string>>(
    ...columns: C[]
  ): Omit<TableNodeBuilder<D, T, R, P, Q>, "columns">

  join<
    JT extends keyof D["tables"],
    JR extends SQLDataTable,
    LC extends keyof D["tables"][T] & string,
  >(
    joinTable: JT,
    tableGenerator: TableGenerator<D, JT, JR, P, Q>,
    leftColumn: LC,
    rightColumn: MatchingProperty<D["tables"][T], D["tables"][JT], LC> & string,
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
  T extends SQLDataTable,
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
