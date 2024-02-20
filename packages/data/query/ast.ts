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
export interface QueryOperation<In extends QueryNode, Out extends QueryNode>
  extends QueryNode {
  inputs: In[]
  outputs: Out[]
}

/**
 * Represents a source of values and their types
 */
export interface QuerySource<T> extends QueryNode {
  columns: (keyof T)[]
}
