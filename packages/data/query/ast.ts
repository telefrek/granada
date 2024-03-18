/**
 * This file contains the AST (Abstract Syntax Tree) for building and resolving
 * queries used in the framework
 */

/**
 * Represents the basic information about a node in the query AST
 */
export interface QueryNode {
  parent?: QueryNode
  children?: QueryNode[]
}

/**
 * Represents an operation that changes inputs into outputs
 */
export type QueryOperation<
  In extends QueryNode,
  Out extends QueryNode,
> = QueryNode & {
  inputs: In[]
  outputs: Out[]
}
