/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils"
import type { RelationalDataStore } from "."
import type { Query } from "../query"
import { QueryBuilderBase } from "../query/builder"
import {
  BooleanOperation,
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ContainmentItemType,
  type ContainmentProperty,
  type FilterGroup,
  type RelationalQueryNode,
  type SelectClause,
  type TableQueryNode,
  type WhereClause,
} from "./ast"

/**
 * Represents a {@link QueryBuilder} that is specifically for relational
 * database queries
 */
export abstract class RelationalQueryBuilder<T> extends QueryBuilderBase<T> {
  constructor(queryNode: RelationalQueryNode<RelationalNodeType>) {
    super(queryNode)
  }
}

/**
 * Constructor type
 */
type QueryBuilderCtor<RowType> = new (
  node: RelationalQueryNode<RelationalNodeType>
) => RelationalQueryBuilder<RowType>

/**
 * Handles building out {@link TableQueryNode} instances
 */
class RelationalTableBuilder<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  RowType = DataStoreType["tables"][TargetTable]
> {
  private clause: TableQueryNode<DataStoreType, TargetTable, RowType>

  constructor(clause: TableQueryNode<DataStoreType, TargetTable, RowType>) {
    this.clause = clause
  }

  /**
   * Alias a column to have a different name on the returned row type
   *
   * @param column The column to rename
   * @param alias The new column alias
   * @returns A new {@link SelectBuilder} with the modified types
   */
  alias<
    OldColumn extends keyof RowType &
      keyof DataStoreType["tables"][TargetTable],
    AliasColumn extends string
  >(
    column: OldColumn,
    alias: AliasColumn
  ): RelationalTableBuilder<
    DataStoreType,
    TargetTable,
    AliasedType<RowType, OldColumn, AliasColumn>
  > {
    // Build the new clause based on the altered return type
    const aliasedClause: TableQueryNode<
      DataStoreType,
      TargetTable,
      AliasedType<RowType, OldColumn, AliasColumn>
    > = {
      nodeType: this.clause.nodeType,
      where: this.clause.where,
      table: this.clause.table,
      select: {
        nodeType: RelationalNodeType.SELECT,
        columns: this.clause.select?.columns ?? [],
        alias: this.clause.select?.alias ?? [],
      },
    }

    // Add the new alias
    aliasedClause.select?.alias?.push({ column, alias })

    return new RelationalTableBuilder(aliasedClause)
  }

  where(
    clause: WhereClause<DataStoreType["tables"][TargetTable]>
  ): Omit<
    RelationalTableBuilder<DataStoreType, TargetTable, RowType>,
    "where"
  > {
    this.clause.where = clause
    return this
  }

  /**
   *
   * @param columns The set of columns to select
   * @returns An updated {@link SelectBuilder}
   */
  select<
    Column extends keyof DataStoreType["tables"][TargetTable],
    SelectType extends Pick<DataStoreType["tables"][TargetTable], Column>
  >(
    ...columns: Column[]
  ): Omit<
    RelationalTableBuilder<DataStoreType, TargetTable, SelectType>,
    "select"
  > {
    return new RelationalTableBuilder({
      table: this.clause.table,
      nodeType: RelationalNodeType.TABLE,
      select: {
        columns: columns ?? [],
        nodeType: RelationalNodeType.SELECT,
        alias: this.clause.select?.alias,
      },
      where: this.clause.where,
    })
  }

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.clause).build()
  }
}

export const query = <DataStoreType extends RelationalDataStore>(): {
  from<TargetTable extends keyof DataStoreType["tables"]>(
    table: TargetTable
  ): RelationalTableBuilder<DataStoreType, TargetTable>
} => {
  return {
    from,
  }
}

/**
 * Utility method for creating a {@link SelectClause}
 *
 * @param table The table to select from
 * @returns A {@link SelectBuilder} that helps with composition of
 * {@link SelectClause} instances
 */
const from = <
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"]
>(
  table: TargetTable
): RelationalTableBuilder<DataStoreType, TargetTable> => {
  return new RelationalTableBuilder({
    table,
    nodeType: RelationalNodeType.TABLE,
  })
}

type BooleanFilter = <RowType>(
  ...clauses: WhereClause<RowType>[]
) => WhereClause<RowType>

export const and: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.AND, ...clauses)

export const or: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.OR, ...clauses)

export const not: BooleanFilter = (...clauses) =>
  ColumnGroupFilterBuilder(BooleanOperation.NOT, ...clauses)

type ColumnFilter = <
  RowType,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType
) => WhereClause<RowType>

export const eq: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.EQ)

export const gt: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GT)

export const gte: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.GTE)

export const lt: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LT)

export const lte: ColumnFilter = (column, value) =>
  ColumnFilterBuilder(column, value, ColumnFilteringOperation.LTE)

export const contains = <
  RowType,
  ContainingColumn extends ContainmentProperty<RowType>,
  ColumnValue extends ContainmentItemType<RowType, ContainingColumn>
>(
  column: ContainingColumn,
  value: ColumnValue
): WhereClause<RowType> => {
  return {
    nodeType: RelationalNodeType.WHERE,
    filter: {
      column,
      value,
      op: ColumnValueContainsOperation.IN,
    },
  }
}

function ColumnGroupFilterBuilder<RowType>(
  op: BooleanOperation,
  ...clauses: WhereClause<RowType>[]
): WhereClause<RowType> {
  return {
    nodeType: RelationalNodeType.WHERE,
    filter: {
      op,
      filters: clauses.map((c) => c.filter),
    } as FilterGroup<RowType>,
  }
}

function ColumnFilterBuilder<
  RowType,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType,
  op: ColumnFilteringOperation
): WhereClause<RowType> {
  return {
    nodeType: RelationalNodeType.WHERE,
    filter: {
      column,
      value,
      op,
    },
  }
}
