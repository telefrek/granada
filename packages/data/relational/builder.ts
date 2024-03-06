/**
 * Extensions for creating relational queries
 */

import type { RelationalDataStore } from "."
import type { Query } from "../query"
import { QueryBuilderBase } from "../query/builder"
import {
  ContainmentOp,
  FilterOp,
  RelationalNodeTypes,
  type AliasedType,
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
  constructor(queryNode: RelationalQueryNode<RelationalNodeTypes>) {
    super(queryNode)
  }
}

/**
 * Handles building out {@link TableQueryNode} instances
 */
abstract class RelationalTableBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R
> {
  protected clause: TableQueryNode<D, T, R>

  constructor(clause: TableQueryNode<D, T, R>) {
    this.clause = clause
  }

  where(clause: WhereClause<D["tables"][T]>): RelationalQueryNodeBuilder<R> {
    return new RelationalQueryNodeBuilder({
      ...this.clause,
      where: clause,
    } as TableQueryNode<D, T, R>)
  }

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(
    ctor: new (
      node: RelationalQueryNode<RelationalNodeTypes>
    ) => RelationalQueryBuilder<R>
  ): Query<R> {
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
  D extends RelationalDataStore,
  T extends keyof D["tables"] = keyof D["tables"]
>(table: T): FromBuilder<D, T> {
  return new FromBuilder(table)
}

/**
 * Utility class for managing relational table transformations
 */
class FromBuilder<
  D extends RelationalDataStore,
  T extends keyof D["tables"]
> extends RelationalTableBuilder<D, T, D["tables"][T]> {
  constructor(table: T) {
    super({ table, nodeType: RelationalNodeTypes.TABLE })
  }

  /**
   *
   * @param columns The set of columns to select
   * @returns An updated {@link SelectBuilder}
   */
  select<K extends keyof D["tables"][T], R extends Pick<D["tables"][T], K>>(
    columns: K[]
  ): SelectBuilder<D, T, R> {
    return new SelectBuilder(
      {
        table: this.clause.table,
        nodeType: RelationalNodeTypes.TABLE,
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
  D extends RelationalDataStore,
  T extends keyof D["tables"],
  R
> extends RelationalTableBuilder<D, T, R> {
  /**
   * Create the builder
   *
   * @param table The required table
   * @param columns The optional columns (undefined or empty is interpreted as all)
   */
  constructor(
    clause: TableQueryNode<D, T, R>,
    columns?: (keyof D["tables"][T])[]
  ) {
    super({
      ...clause,
      select: {
        columns: columns ?? [],
        nodeType: RelationalNodeTypes.SELECT,
      },
    })
  }

  alias<O extends keyof R & keyof D["tables"][T], N extends string>(
    column: O,
    alias: N
  ): RelationalQueryNodeBuilder<AliasedType<R, O, N>> {
    this.clause.select!.alias = { column, alias }
    return new RelationalQueryNodeBuilder(this.clause)
  }
}

type ColumnFilterFn = <R, C extends keyof R, V extends R[C]>(
  column: C,
  value: V
) => WhereClause<R>

type ColumnInFilterRn = <
  R,
  C extends ContainmentProperty<R>,
  V extends ContainmentItemType<R, C>
>(
  column: C,
  value: V
) => WhereClause<R>

export const columns: {
  [key in keyof typeof FilterOp]: ColumnFilterFn
} & {
  [key in keyof typeof ContainmentOp]: ColumnInFilterRn
} = {
  GT: (c, v) => cf(c, v, FilterOp.GT),
  LT: (c, v) => cf(c, v, FilterOp.LT),
  GTE: (c, v) => cf(c, v, FilterOp.GTE),
  LTE: (c, v) => cf(c, v, FilterOp.LTE),
  EQ: (c, v) => cf(c, v, FilterOp.EQ),
  IN: (column, value) => {
    return {
      nodeType: RelationalNodeTypes.WHERE,
      filter: {
        column,
        value,
        op: ContainmentOp.IN,
      },
    }
  },
}

function cf<R, C extends keyof R, V extends R[C]>(
  column: C,
  value: V,
  op: FilterOp
): WhereClause<R> {
  return {
    nodeType: RelationalNodeTypes.WHERE,
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
class RelationalQueryNodeBuilder<R> {
  private clause: RelationalQueryNode<RelationalNodeTypes>

  constructor(clause: RelationalQueryNode<RelationalNodeTypes>) {
    this.clause = clause
  }

  /**
   * Retrieve a builder that can be used to create {@link Query} objects
   *
   * @param ctor A class the implements the given constructor
   * @returns A new {@link RelationalQueryBuilder} for the table
   */
  build(
    ctor: new (
      node: RelationalQueryNode<RelationalNodeTypes>
    ) => RelationalQueryBuilder<R>
  ): Query<R> {
    return new ctor(this.clause).build()
  }
}
