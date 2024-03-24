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
