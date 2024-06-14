/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The building blocks for our SQL AST structure
 */

/**
 * The set of value types supported
 */
export type ValueTypes =
  | BooleanValueType
  | NumberValueType
  | BigIntValueType
  | BufferValueType
  | StringValueType
  | JsonValueType
  | ArrayValueType
  | NullValueType
  | ParameterValueType
  | ColumnReference<any>

/**
 * A parameter that is passed into the query at runtime
 */
export type ParameterValueType<Name extends string = string> = {
  type: "ParameterValue"
  name: Name
}

/**
 * A {@link boolean} value
 */
export type BooleanValueType<B extends boolean = boolean> = {
  type: "BooleanValue"
  value: B
}

/**
 * A {@link number} value
 */
export type NumberValueType<N extends number = number> = {
  type: "NumberValue"
  value: N
}

/**
 * A {@link bigint} value
 */
export type BigIntValueType<B extends number | bigint = bigint> = {
  type: "BigIntValue"
  value: B
}

/**
 * A {@link Int8Array} value
 */
export type BufferValueType<B extends Int8Array = Int8Array> = {
  type: "BufferValue"
  value: B
}

/**
 * A {@link string} value
 */
export type StringValueType<S extends string = string> = {
  type: "StringValue"
  value: S
}

/**
 * An explicit `null` reference
 */
export type NullValueType = {
  type: "NullValue"
  value: null
}

/**
 * A JSON value
 */
export type JsonValueType<J extends object = object> = {
  type: "JsonValue"
  value: J
}

/**
 * An array value
 */
export type ArrayValueType<A extends any[] = any[]> = {
  type: "ArrayValue"
  value: A
}

/**
 * Types for building filtering trees
 */
export type FilteringOperation =
  | "="
  | "<"
  | ">"
  | "<="
  | ">="
  | "!="
  | "<>"
  | "LIKE"
  | "ILIKE"

/**
 * Operation to modify a value
 */
export type ArithmeticOperation =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "&"
  | "|"
  | "^"
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "&="

/**
 * Structure of a subquery
 */
export type SubQuery<Query extends SQLQuery<any> = SQLQuery<any>> = {
  type: "SubQuery"
  query: Query
}

/**
 * A filter between two objects
 */
export type ColumnFilter<
  Left extends ColumnReference<any> = ColumnReference<any>,
  Operation extends FilteringOperation = FilteringOperation,
  Right extends ValueTypes = ValueTypes,
> = {
  type: "ColumnFilter"
  left: Left
  op: Operation
  right: Right
}

export type SubQueryFilterOperation = "IN" | "ANY" | "ALL" | "EXISTS" | "SOME"

/**
 * The IN filter definition
 */
export type SubqueryFilter<
  Column extends ColumnReference<any> = ColumnReference<any>,
  Subquery extends SubQuery<any> = SubQuery<any>,
  Op extends SubQueryFilterOperation = SubQueryFilterOperation,
> = {
  type: "SubqueryFilter"
  column: Column
  query: Subquery
  op: Op
}

/**
 * Types for building logical trees
 */
export type LogicalOperation = "AND" | "OR" | "NOT"

/**
 * A logical tree structure for processing groups of filters
 */
export type LogicalTree<
  Left extends LogicalExpression = LogicalExpression,
  Operation extends LogicalOperation = LogicalOperation,
  Right extends LogicalExpression = LogicalExpression,
> = {
  type: "LogicalTree"
  left: Left
  op: Operation
  right: Right
}

/**
 * The valid types for building a logical expression tree
 */
export type LogicalExpression =
  | ValueTypes
  | LogicalTree<any, LogicalOperation, any>
  | ColumnFilter<any>
  | SubqueryFilter<any>

/**
 * A Column that we don't know the ownership of
 */
export type UnboundColumnReference<Column extends string = string> = {
  type: "UnboundColumnReference"
  column: Column
}

/**
 * A column with an identified table
 */
export type TableColumnReference<
  Table extends string = string,
  Column extends string = string,
> = {
  type: "TableColumnReference"
  table: Table
  column: Column
}

/**
 * A reference (bound or unbound) to a column
 */
export type ColumnReference<
  Reference extends
    | UnboundColumnReference
    | TableColumnReference = UnboundColumnReference,
  Alias extends string = Reference["column"],
> = {
  type: "ColumnReference"
  reference: Reference
  alias: Alias
}

/**
 * Supported aggregation operations
 */
export type ColumnAggregateOperation = "SUM" | "COUNT" | "AVG" | "MAX" | "MIN"

/**
 * An aggregation on a column (ex: COUNT(id) AS `count`)
 */
export type ColumnAggregate<
  Column extends ColumnReference<any> = ColumnReference<any>,
  Aggregate extends ColumnAggregateOperation = ColumnAggregateOperation,
  Alias extends string = string,
> = {
  type: "ColumnAggregate"
  column: Column
  aggregate: Aggregate
  alias: Alias
}

/**
 * A reference to a table
 */
export type TableReference<
  Table extends string = string,
  Alias extends string = Table,
> = {
  type: "TableReference"
  table: Table
  alias: Alias
}

/**
 * The supported join types
 */
export type JoinType = "LEFT" | "RIGHT" | "INNER" | "OUTER"

/**
 * A join clause
 */
export type JoinClause<
  Type extends JoinType = JoinType,
  From extends TableReference<any> | NamedQuery<any> = TableReference<any>,
  On extends LogicalExpression = LogicalExpression,
> = {
  type: "JoinClause"
  joinType: Type
  from: From
  on: On
}

/**
 * Selected columns can be references or aggregates
 */
export type SelectedColumn = ColumnAggregate<any> | ColumnReference<any>

/**
 * Structure for a select clause
 */
export type SelectClause<
  Columns extends SelectedColumn[] | "*" = "*",
  From extends TableReference<any> | NamedQuery<any> = TableReference<any>,
> = {
  type: "SelectClause"
  columns: Columns
  from: From
}

export type LimitClause<
  Offset extends number = number,
  Limit extends number = number,
> = {
  offset: Offset
  limit: Limit
}

/**
 * Required structure for where clause
 */
export type WhereClause<Where extends LogicalExpression = LogicalExpression> = {
  where: Where
}

export type GroupByClause<
  GroupBy extends ColumnReference<any>[] = ColumnReference<any>[],
> = {
  groupBy: GroupBy
}

// TODO: Add asc/desc
export type OrderingClause<
  OrderBy extends ColumnReference<any>[] = ColumnReference<any>[],
> = {
  orderBy: OrderBy
}

export type HavingClause<Having extends LogicalExpression = LogicalExpression> =
  {
    having: Having
  }

export type SelectJoinClause<
  Joins extends JoinClause<any>[] = JoinClause<any>[],
> = {
  joins: Joins
}

/**
 * Updates can modify columns
 */
export type ColumnAssignment<
  Column extends ColumnReference<any> = ColumnReference<any>,
  Value extends ValueTypes = ValueTypes,
> = {
  type: "ColumnAssignment"
  column: Column
  value: Value
}

export type ReturningClause<
  Returning extends TableColumnReference<any>[] = TableColumnReference<any>[],
> = {
  returning: Returning
}

/**
 * Structure for an update clause
 */
export type UpdateClause<
  Table extends TableReference<any> = TableReference<any>,
  Columns extends ColumnAssignment<any>[] = ColumnAssignment<any>[],
> = {
  type: "UpdateClause"
  columns: Columns
  table: Table
}

/**
 * Structure for a delete clause
 */
export type DeleteClause<
  Table extends TableReference<any> = TableReference<any>,
> = {
  type: "DeleteClause"
  table: Table
}

/**
 * Structure for an insert clause
 */
export type InsertClause<
  Table extends TableReference<any> = TableReference<any>,
  Columns extends ColumnReference<any>[] = ColumnReference<any>[],
  Values extends ValueTypes[] | SelectClause<any> = ValueTypes[],
> = {
  type: "InsertClause"
  table: Table
  columns: Columns
  values: Values
}

/**
 * A named query
 */
export type NamedQuery<
  Query extends SQLQuery<any> = SQLQuery<any>,
  Alias extends string = string,
> = {
  type: "NamedQuery"
  query: Query
  alias: Alias
}

/**
 * Ways to combine two queries
 */
export type CombineOperation = "UNION" | "INTERSECT" | "MINUS" | "EXCEPT"

/**
 * An operation and additional select clause to apply
 */
export type CombinedQuery<
  Operation extends CombineOperation = CombineOperation,
  Next extends SelectClause<any> = SelectClause<any>,
> = {
  type: "CombinedQuery"
  op: Operation
  next: Next
}

/**
 * A chain of select clauses
 */
export type CombinedQueryClause<
  Original extends SelectClause<any> = SelectClause<any>,
  Additions extends CombinedQuery<any>[] = CombinedQuery<any>[],
> = {
  type: "CombinedQueryClause"
  original: Original
  additions: Additions
}

export type WithClause<With extends NamedQuery<any>[] = NamedQuery<any>[]> = {
  with: With
}

export type QueryClause =
  | SelectClause<any>
  | UpdateClause<any>
  | DeleteClause<any>
  | InsertClause<any>
  | CombinedQueryClause<any>

/**
 * Structure for a generic SQL Query
 */
export type SQLQuery<Query extends QueryClause = SelectClause<any>> = {
  type: "SQLQuery"
  query: Query
}
