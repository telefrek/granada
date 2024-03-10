/**
 * This file contains the AST (Abstract Syntax Tree) for building and resolving
 * queries used in the framework
 */

import type { OptionalProperties } from "@telefrek/core/type/utils.js"

/**
 * Represents the basic information about a node in the query AST
 */
export type QueryNode = {
  parent?: QueryNode
  children?: QueryNode[]
}

/**
 * Represents an operation that changes inputs into outputs
 */
export type QueryOperation<
  In extends QueryNode,
  Out extends QueryNode
> = QueryNode & {
  inputs: In[]
  outputs: Out[]
}

/**
 * Represents a source of values and their types as well as optional default values
 */
export type QuerySource<T> = QueryNode & {
  defaults?: Partial<OptionalProperties<T>>
}
