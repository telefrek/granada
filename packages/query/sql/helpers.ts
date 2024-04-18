/**
 * This package has a set of helper files for manipulating the relational AST objects
 */

import { getDebugInfo } from "@telefrek/core/index.js"
import type { Optional } from "@telefrek/core/type/utils"
import {
  SQLNodeType,
  type CteClause,
  type DeleteClause,
  type InsertClause,
  type JoinClauseQueryNode,
  type JoinQueryNode,
  type SQLQueryNode,
  type SelectClause,
  type SetClause,
  type TableSQLQueryNode,
  type UpdateClause,
  type WhereClause,
} from "./ast.js"
import {
  isBranchNode,
  isColumnAliasClause,
  isJoinClauseNode,
  isNamedSQLQueryNode,
  isReturningClause,
  isSQLQueryNode,
  isWhereClause,
} from "./typeGuards.js"
import type { STAR } from "./types.js"

type RNode = SQLQueryNode<SQLNodeType>

/**
 * Find the root of the AST
 *
 * @param node The {@link SQLQueryNode} to start with
 * @returns The root of the AST
 */
export function getTreeRoot(node: RNode): RNode {
  let current = node
  while (current.parent && isSQLQueryNode(current.parent)) {
    current = current.parent
  }

  return current
}

export function getChildBranches(node: RNode): Optional<RNode[]> {
  return node.children?.filter(isSQLQueryNode).filter(isBranchNode)
}

/**
 * Helper method to identify if the query utilizes any projections
 *
 * @param node The {@link SQLQueryNode} to search
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
      case SQLNodeType.CTE:
        return true
      default:
        if (isNamedSQLQueryNode(next) && next.alias) {
          return true
        }
        break
    }

    // Queue the children to search
    queue.push(...(next.children?.filter(isSQLQueryNode) ?? []))
  }

  return false
}

/**
 * Common logic shared by all {@link SQLQueryNode} objects
 */
abstract class RelationalASTNodeManager<NodeType extends RNode> {
  protected node: NodeType

  constructor(node: NodeType) {
    this.node = node
  }

  /**
   * Get the {@link SQLQueryNode} that is a child of this query
   */
  get children(): Optional<RNode[]> {
    return getChildBranches(this.node)
  }

  public toString = (): string => getDebugInfo(this.node)
}

abstract class TableNodeManager<
  NodeType extends TableSQLQueryNode<SQLNodeType>,
> extends RelationalASTNodeManager<NodeType> {
  get tableName(): string {
    return this.node.tableName
  }

  get tableAlias(): Optional<string> {
    return this.node.alias
  }
}

export class InsertNodeManager extends TableNodeManager<InsertClause> {
  get columns(): Optional<string[]> {
    return this.node.columns
  }

  get returning(): string[] | STAR | undefined {
    return this.node.children?.filter(isReturningClause).at(0)?.columns
  }
}

export class UpdateNodeManager extends TableNodeManager<UpdateClause> {
  get updates(): SetClause[] {
    return this.node.setColumns
  }

  get returning(): string[] | STAR | undefined {
    return this.node.children?.filter(isReturningClause).at(0)?.columns
  }

  /**
   * Get the {@link WhereClause} if present
   */
  get where(): Optional<WhereClause> {
    return this.node.children?.filter(isWhereClause).at(0)
  }
}

export class DeleteNodeManager extends TableNodeManager<DeleteClause> {
  get returning(): string[] | STAR | undefined {
    return this.node.children?.filter(isReturningClause).at(0)?.columns
  }

  /**
   * Get the {@link WhereClause} if present
   */
  get where(): Optional<WhereClause> {
    return this.node.children?.filter(isWhereClause).at(0)
  }
}

/**
 * Helper class for manipulating {@link TableQueryNode}
 */
export class SelectNodeManager extends TableNodeManager<SelectClause> {
  get columnAlias(): Map<string, string> {
    return (
      this.node.children?.filter(isColumnAliasClause).at(0)?.aliasing ??
      new Map()
    )
  }

  /**
   * Get the {@link SelectClause} if present
   */
  get select(): SelectClause {
    return this.node
  }

  /**
   * Get the {@link WhereClause} if present
   */
  get where(): Optional<WhereClause> {
    return this.node.children?.filter(isWhereClause).at(0)
  }
}

export class CteNodeManager extends RelationalASTNodeManager<CteClause> {
  get source(): RNode {
    return this.node.source
  }

  override get children(): Optional<RNode[]> {
    return this.node.children
      ?.filter(isSQLQueryNode)
      .filter((c) => c !== this.source)
  }
}

export class JoinNodeManager extends RelationalASTNodeManager<JoinQueryNode> {
  get tables(): TableSQLQueryNode<SQLNodeType>[] {
    return (
      this.node.children
        ?.filter(isNamedSQLQueryNode)
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
