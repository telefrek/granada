import {
  ColumnReference,
  TableColumnReference,
  UnboundColumnReference,
} from "../ast.js"

export type ParseColumnReference<T extends string> =
  T extends `${infer ColumnDetails} AS ${infer Alias}`
    ? ColumnReference<ParseColumnDetails<ColumnDetails>, Alias>
    : ColumnReference<ParseColumnDetails<T>>

export type ParseColumnDetails<T extends string> =
  T extends `${infer Table}.${infer Column}`
    ? TableColumnReference<Table, Column>
    : UnboundColumnReference<T>
