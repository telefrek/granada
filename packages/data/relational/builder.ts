/**
 * Extensions for creating relational queries
 */

import type { AliasedType } from "@telefrek/core/type/utils"
import type { RelationalDataStore } from "."
import type { Query } from "../query"
import { QueryBuilderBase } from "../query/builder"
import {
  ColumnFilteringOperation,
  ColumnValueContainsOperation,
  RelationalNodeType,
  type ContainmentItemType,
  type ContainmentProperty,
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
abstract class RelationalTableBuilder<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  RowType
> {
  protected clause: TableQueryNode<DataStoreType, TargetTable, RowType>

  constructor(clause: TableQueryNode<DataStoreType, TargetTable, RowType>) {
    this.clause = clause
  }

  where(
    clause: WhereClause<DataStoreType["tables"][TargetTable]>
  ): RelationalQueryNodeBuilder<RowType> {
    return new RelationalQueryNodeBuilder({
      ...this.clause,
      where: clause,
    } as TableQueryNode<DataStoreType, TargetTable, RowType>)
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

/**
 * Utility method for creating a {@link SelectClause}
 *
 * @param table The table to select from
 * @returns A {@link SelectBuilder} that helps with composition of
 * {@link SelectClause} instances
 */
export function from<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"] = keyof DataStoreType["tables"]
>(table: TargetTable): FromBuilder<DataStoreType, TargetTable> {
  return new FromBuilder(table)
}

/**
 * Utility class for managing relational table transformations
 */
class FromBuilder<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"]
> extends RelationalTableBuilder<
  DataStoreType,
  TargetTable,
  DataStoreType["tables"][TargetTable]
> {
  constructor(table: TargetTable) {
    super({ table, nodeType: RelationalNodeType.TABLE })
  }

  /**
   *
   * @param columns The set of columns to select
   * @returns An updated {@link SelectBuilder}
   */
  select<
    Column extends keyof DataStoreType["tables"][TargetTable],
    RowType extends Pick<DataStoreType["tables"][TargetTable], Column>
  >(columns: Column[]): SelectBuilder<DataStoreType, TargetTable, RowType> {
    return new SelectBuilder(
      {
        table: this.clause.table,
        nodeType: RelationalNodeType.TABLE,
      },
      columns
    )
  }
}

/**
 * Handles manipulations of the {@link SelectClause} used by internal query
 * builders
 */
class SelectBuilder<
  DataStoreType extends RelationalDataStore,
  TargetTable extends keyof DataStoreType["tables"],
  RowType
> extends RelationalTableBuilder<DataStoreType, TargetTable, RowType> {
  /**
   * Create the builder
   *
   * @param table The required table
   * @param columns The optional columns (undefined or empty is interpreted as all)
   */
  constructor(
    clause: TableQueryNode<DataStoreType, TargetTable, RowType>,
    columns?: (keyof DataStoreType["tables"][TargetTable])[]
  ) {
    super({
      ...clause,
      select: {
        columns: columns ?? clause.select?.columns ?? [],
        nodeType: RelationalNodeType.SELECT,
        alias: clause.select?.alias,
      },
    })
  }

  alias<
    OldColumn extends keyof RowType &
      keyof DataStoreType["tables"][TargetTable],
    AliasColumn extends string
  >(
    column: OldColumn,
    alias: AliasColumn
  ): SelectBuilder<
    DataStoreType,
    TargetTable,
    AliasedType<RowType, OldColumn, AliasColumn>
  > {
    // Build the new clause
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

    return new SelectBuilder(aliasedClause)
  }
}

type ColumnFilterFn = <
  RowType,
  Column extends keyof RowType,
  ColumnType extends RowType[Column]
>(
  column: Column,
  value: ColumnType
) => WhereClause<RowType>

type ColumnInFilterRn = <
  RowType,
  ContainingColumn extends ContainmentProperty<RowType>,
  ColumnValue extends ContainmentItemType<RowType, ContainingColumn>
>(
  column: ContainingColumn,
  value: ColumnValue
) => WhereClause<RowType>

type FilterOperations = {
  [key in keyof typeof ColumnFilteringOperation]: ColumnFilterFn
} & {
  [key in keyof typeof ColumnValueContainsOperation]: ColumnInFilterRn
}

export const columns: FilterOperations = {
  GT: (c, v) => ColumnFilterBuilder(c, v, ColumnFilteringOperation.GT),
  LT: (c, v) => ColumnFilterBuilder(c, v, ColumnFilteringOperation.LT),
  GTE: (c, v) => ColumnFilterBuilder(c, v, ColumnFilteringOperation.GTE),
  LTE: (c, v) => ColumnFilterBuilder(c, v, ColumnFilteringOperation.LTE),
  EQ: (c, v) => ColumnFilterBuilder(c, v, ColumnFilteringOperation.EQ),
  IN: (column, value) => {
    return {
      nodeType: RelationalNodeType.WHERE,
      filter: {
        column,
        value,
        op: ColumnValueContainsOperation.IN,
      },
    }
  },
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

/**
 * Class that holds the materialized {@link RelationalQueryNode} clause
 */
class RelationalQueryNodeBuilder<RowType> {
  private clause: RelationalQueryNode<RelationalNodeType>

  constructor(clause: RelationalQueryNode<RelationalNodeType>) {
    this.clause = clause
  }

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given {@link QueryBuilderCtor}
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(ctor: QueryBuilderCtor<RowType>): Query<RowType> {
    return new ctor(this.clause).build()
  }
}
