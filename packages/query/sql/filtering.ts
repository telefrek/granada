/**
 * Represents different types of column ifltring operations
 */
export enum ColumnFilteringOperation {
  EQ = "=",
  LT = "<",
  GT = ">",
  LTE = "<=",
  GTE = ">=",
}

/**
 * Represents differernt type of column containment operations
 */
export enum ColumnValueContainsOperation {
  IN = "in",
}

/**
 * Represents different boolean operations available
 */
export enum BooleanOperation {
  AND = "and",
  OR = "or",
  NOT = "not",
}

/**
 * A filter on a {@link JoinClauseQueryNode}
 */
export interface JoinColumnFilter {
  leftColumn: string
  rightColumn: string
  op: ColumnFilteringOperation
}

/**
 * Represents a filter on a given column like:`table.column {op} value`
 */
export type ColumnFilter = {
  column: string
  op: ColumnFilteringOperation
} & (ParameterFilter | ValueFilter | NullFilter)

/**
 * The type of containment object being examined (strings and arrays are different)
 */
export enum ContainmentObjectType {
  ARRAY,
  STRING,
}

/**
 * Defines a simple containment filter with the type of object the containment references
 */
export type ContainmentFilter<ContainmentObjectType> = {
  columnType: ContainmentObjectType
  column: string
  op: ColumnValueContainsOperation
} & (ParameterFilter | ValueFilter)

/**
 * A containment filter specific to array operations
 */
export type ArrayFilter = ContainmentFilter<ContainmentObjectType.ARRAY>

/**
 * A containment filter specific to string objects
 */
export type StringFilter = ContainmentFilter<ContainmentObjectType.STRING>

/**
 * Map of valid filter types for grouping
 */
export type FilterTypes = ColumnFilter | ArrayFilter | StringFilter

/**
 * Represents a group of filters that are bound by a {@link BooleanOperation}
 */
export interface FilterGroup {
  filters: (FilterTypes | FilterGroup)[]
  op: BooleanOperation
}

export type ParameterFilter = {
  type: "parameter"
  name: string
}

export type ValueFilter = {
  type: "value"
  value: unknown
}

export type NullFilter = {
  type: "null"
}
