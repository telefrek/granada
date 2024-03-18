/**
 * This package has a set of helper files for manipulating the relational AST objects
 */

import { getDebugInfo } from "@telefrek/core"
import {
  isColumnAlias,
  isGenerator,
  isJoinClauseNode,
  isRelationalQueryNode,
  isSelectClause,
  isTableQueryNode,
  isWhereClause,
  type ColumnAlias,
  type CteClause,
  type JoinClauseQueryNode,
  type JoinQueryNode,
  type RelationalQueryNode,
  type SelectClause,
  type TableQueryNode,
  type WhereClause,
} from "./ast"
import type { RelationalDataStore, RelationalDataTable } from "./index"
import { RelationalNodeType } from "./types"

type RNode = RelationalQueryNode<RelationalNodeType>

/**
 * Find the root of the AST
 *
 * @param node The {@link RelationalQueryNode} to start with
 * @returns The root of the AST
 */
export function getTreeRoot(node: RNode): RNode {
  let current = node
  while (current.parent && isRelationalQueryNode(current.parent)) {
    current = current.parent
  }

  return current
}

/**
 * Helper method to identify if the query utilizes any projections
 *
 * @param node The {@link RelationalQueryNode} to search
 * @returns True if there are any projections that need to be resolved
 */
export function hasProjections(node: RNode): boolean {
  // Ensure we are at the root
  const root = getTreeRoot(node)

  // Process the tree in a BFS fashion (projections should generally be at the
  // higher levels)
  const queue: RNode[] = [root]
  while (queue.length > 0) {
    const next = queue.shift()!

    // Check if we have any nodes that are known projection types (aliasing,
    // compositional sets, etc.)
    switch (next.nodeType) {
      case RelationalNodeType.CTE:
        return true
      case RelationalNodeType.TABLE:
        if (isTableQueryNode(next) && next.alias) {
          return true
        }
        break
    }

    // Queue the children to search
    queue.push(...(next.children?.filter(isRelationalQueryNode) ?? []))
  }

  return false
}

/**
 * Common logic shared by all {@link RelationalQueryNode} objects
 */
abstract class RelationalASTNodeManager<NodeType extends RNode> {
  protected node: NodeType

  constructor(node: NodeType) {
    this.node = node
  }

  /**
   * Get the {@link RelationalQueryNode} that is a child of this query
   */
  get child(): RNode | undefined {
    return this.node.children
      ?.filter(isRelationalQueryNode)
      .filter(isGenerator)
      .at(0)
  }

  public toString = (): string => getDebugInfo(this.node)
}

/**
 * Helper class for manipulating {@link TableQueryNode}
 */
export class TableNodeManager extends RelationalASTNodeManager<TableQueryNode> {
  get tableName(): keyof RelationalDataStore["tables"] {
    return this.node.tableName
  }

  get tableAlias(): keyof RelationalDataStore["tables"] | undefined {
    return this.node.alias
  }

  get columnAlias(): ColumnAlias<
    RelationalDataTable,
    keyof RelationalDataTable,
    string
  >[] {
    return this.node.children?.filter(isColumnAlias) ?? []
  }

  /**
   * Get the {@link SelectClause} if present
   */
  get select(): SelectClause {
    return this.node.children!.filter(isSelectClause).at(0)!
  }

  /**
   * Get the {@link WhereClause} if present
   */
  get where(): WhereClause<RelationalDataTable> | undefined {
    return this.node.children?.filter(isWhereClause).at(0)
  }
}

export class CteNodeManager extends RelationalASTNodeManager<CteClause> {
  override get child(): RNode | undefined {
    return this.node.children
      ?.filter(isRelationalQueryNode)
      .filter((c) => c !== this.node.source)
      .at(0)
  }
}

export class JoinNodeManager extends RelationalASTNodeManager<JoinQueryNode> {
  get tables(): TableQueryNode[] {
    return (
      this.node.children
        ?.filter(isTableQueryNode)
        .sort((l, r) => l.tableName.localeCompare(r.tableName)) ?? []
    )
  }

  get filters(): JoinClauseQueryNode[] {
    return (
      this.node.children
        ?.filter(isJoinClauseNode)
        .sort((l, r) => l.left.localeCompare(r.left)) ?? []
    )
  }
}
