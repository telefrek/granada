/**
 * Extensions to the base query AST specific for sql data sources
 */

import type { QueryNode } from "../../index"
import type { SQLDataStore, STAR } from "../index"
import type {
  FilterGroup,
  FilterTypes,
  JoinColumnFilter,
  NullFilter,
  ParameterFilter,
  ValueFilter,
} from "./filtering"

/**
 * The valid set of join types supported
 */
export enum JoinType {
  INNER = "inner",
  LEFT = "left",
  RIGHT = "right",
  FULL = "full",
}

/**
 * Custom type to map records of {@link SQLDataStore} keys
 */
export type TableAlias = Record<
  keyof SQLDataStore["tables"],
  keyof SQLDataStore["tables"]
>

/**
 * The supported types a {@link SQLQueryNode} can have
 */
export enum SQLNodeType {
  WHERE = "where",
  CTE = "cte",
  JOIN = "join",
  ON = "on",
  ALIAS = "alias",
  PARAMETER = "parameter",
  RETURNING = "returning",
  SELECT = "select",
  INSERT = "insert",
  UPDATE = "update",
  MERGE = "merge",
  DELETE = "delete",
}

/**
 * Represents an internal {@link QueryNode} use for building sql queries
 */
export type SQLQueryNode<NodeType extends SQLNodeType> = QueryNode & {
  nodeType: NodeType
}
/**
 * A type of {@link SQLQueryNode} that produces rows with a named table (either alias or existing)
 */
export interface TableSQLQueryNode<NodeType extends SQLNodeType>
  extends SQLQueryNode<NodeType> {
  tableName: string
  alias?: string
}

export type ReturningClause = SQLQueryNode<SQLNodeType.RETURNING> & {
  columns?: string[] | STAR
}

export type SetClause = {
  column: string
} & (ParameterFilter | ValueFilter | NullFilter)

export type InsertClause = TableSQLQueryNode<SQLNodeType.INSERT> & {
  columns?: string[]
}

export type UpdateClause = TableSQLQueryNode<SQLNodeType.UPDATE> & {
  setColumns: SetClause[]
}

export type MergeClause = TableSQLQueryNode<SQLNodeType.MERGE>

export type DeleteClause = TableSQLQueryNode<SQLNodeType.DELETE>

/**
 * A {@link SQLQueryNode} that represents a common table expression
 */
export type CteClause = TableSQLQueryNode<SQLNodeType.CTE> & {
  source: SQLQueryNode<SQLNodeType>
}

/**
 * A {@link SQLQueryNode} that indicates a select clause
 */
export type SelectClause = TableSQLQueryNode<SQLNodeType.SELECT> & {
  columns: string[] | STAR
}

/**
 * An alias for a column in a {@link SelectClause}
 */
export type ColumnAliasClause = SQLQueryNode<SQLNodeType.ALIAS> & {
  aliasing: Map<string, string>
}

/**
 * Represents a where clause
 */
export type WhereClause = SQLQueryNode<SQLNodeType.WHERE> & FilteredClause

/**
 * A type of {@link SQLQueryNode} that represents a join operation
 */
export type JoinQueryNode = SQLQueryNode<SQLNodeType.JOIN>

/**
 * A type of {@link SQLQueryNode} that represents a join clause
 */
export type JoinClauseQueryNode = SQLQueryNode<SQLNodeType.ON> & {
  left: string
  right: string
  filter: JoinColumnFilter
  type: JoinType
}
/**
 * A type of {@link SQLQueryNode} that indicates a parameter reference
 */
export type ParameterClause = SQLQueryNode<SQLNodeType.PARAMETER> & {
  parameters: Map<string, string>
}

type FilteredClause = {
  filter: FilterGroup | FilterTypes
}
