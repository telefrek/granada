/**
 * Basic implementation of a prefix tree (trie)
 */

import type { Optional } from "../type/utils.js"

/**
 * A prefix trie for storing information
 */
export interface Trie<T> {
  /**
   * Check to see if the key is in the trie
   *
   * @param key The key to locate
   *
   * @returns True if the key exists
   */
  has(key: string): boolean

  /**
   * Retrieve the value stored at the key
   *
   * @param key The key to locate
   *
   * @returns The object associated with the key if it exists
   */
  get(key: string): Optional<T>

  /**
   * Set the value at the given key
   *
   * @param key The key to store with
   * @param obj The value to store that location
   */
  set(key: string, obj: T): void

  /**
   * Remove the value from the trie
   *
   * @param key The key to remove
   *
   * @returns True if the key was in the trie
   */
  remove(key: string): boolean
}

/**
 * Default implementation of the {@link Trie} interface
 */
export class DefaultTrie<T> implements Trie<T> {
  private readonly _root: TrieNode<T> = { prefix: "", children: [] }

  has(key: string): boolean {
    return searchTrie(key, this._root)?.value !== undefined
  }

  get(key: string): Optional<T> {
    return searchTrie(key, this._root)?.value
  }

  set(key: string, obj: T): void {
    insertTrie(key, obj, this._root)
  }

  remove(key: string): boolean {
    const current = searchTrie(key, this._root)
    if (current && current.value !== undefined) {
      // Clear the value
      current.value = undefined

      // Fix the tree
      collapse(current)

      return true
    }

    return false
  }
}

/**
 * Determine the longest common prefix between two strings
 *
 * @param left The left string
 * @param right The right string
 * @param offset The optional offset for the left side search
 * @returns The length of the longest common prefix (-1 if there is no overlap)
 */
export function lcp(left: string, right: string): number
export function lcp(left: string, right: string, offset: number): number
export function lcp(left: string, right: string, offset: number = 0): number {
  // Find the upper bound
  const l = Math.min(left.length - offset, right.length)

  // If no match on the first character or one is zero no lcp
  if (l === 0 || left[offset] !== right[0]) {
    return -1
  } else if (offset === 0) {
    // Check all characters
    for (let n = 1; n < l; ++n) {
      if (left[n] !== right[n]) {
        return n
      }
    }

    return l
  }

  // Check all characters using the offset
  for (let n = 1; n < l; ++n) {
    if (left[n + offset] !== right[n]) {
      return n
    }
  }

  // Must be match of the shortest of the strings
  return l
}

/**
 * Cleanup the trie when we remove data from a node
 *
 * @param node The {@link TrieNode} that changed
 */
function collapse<T>(node: TrieNode<T>): void {
  // We have children that potentially need adjusting
  if (node.children.length === 0 && node.parent) {
    const children = node.parent.children
    children.splice(children.indexOf(node))

    // Collapse up the tree
    if (node.parent.value === undefined) {
      collapse(node.parent!)
    }
  } else if (node.children.length === 1) {
    // Collapse the child with this node
    const child = node.children[0]
    node.prefix = node.prefix + child.prefix
    node.children = child.children
    node.value = child.value

    child.children.forEach((c) => (c.parent = node))
  }
}

/**
 * Insert the value at the path from the given root
 *
 * @param path The path to insert
 * @param value The value to insert at the locatoin
 * @param root The root {@link TrieNode} to start the insert at
 * @param idx The substring in the path to start from (default 0)
 */
function insertTrie<T>(
  path: string,
  value: T,
  root: TrieNode<T>,
  idx: number = 0,
): void {
  let l = -1

  let current: Optional<TrieNode<T>>
  let last = root
  let children = root.children

  for (const child of children) {
    if ((l = lcp(path, child.prefix, idx)) > 0) {
      current = child
      break
    }
  }

  // Keep searching until we can't find a partial match
  while (current) {
    if (l === current.prefix.length) {
      idx += l
      last = current
      current = undefined
      children = last.children
      for (const child of children) {
        if ((l = lcp(path, child.prefix, idx)) > 0) {
          current = child
          break
        }
      }
    } else {
      // Partial match, we need to slice!

      last = {
        parent: last,
        prefix: path.substring(idx, idx + l),
        children: [current],
      }
      idx += l

      // Remove the current node from the previous children
      children.splice(children.indexOf(current))
      children.push(last)

      // Adjust the prefix
      current.prefix = current.prefix.substring(l)
      current.parent = last
      current = undefined
      children = last.children
    }
  }

  // We went all the way down to a previous entry...
  if (idx === path.length) {
    last.value = value
  } else {
    children.push({
      prefix: path.substring(idx),
      children: [],
      value,
      parent: last,
    })
  }
}

/**
 * Iterative search for the target path in the {@link Trie} from the given node.
 *
 * @param path The path to find in the trie
 * @param root The current {@link TrieNode}
 * @param idx The index along the path to search from
 * @returns The matching {@link TrieNode}
 */
function searchTrie<T>(
  path: string,
  root: TrieNode<T>,
  idx: number = 0,
): Optional<TrieNode<T>> {
  // Setup state variables
  let l = -1

  // Get pointers to the current and child nodes
  let current: Optional<TrieNode<T>>
  let children = root.children

  // Search for root child with match
  for (const child of children) {
    // Check for any lcp
    // NOTE: For really dense trie this isn't as efficient as lookup
    if ((l = lcp(path, child.prefix, idx)) > 0) {
      current = child
      break
    }
  }

  // Loop until we find it or run out of search space
  while (current !== undefined) {
    // Not a full match, get out
    if (l !== current.prefix.length) {
      return
    } else if (l + idx === path.length) {
      // Full match
      return current
    } else {
      idx += l // Add the prefix length
      children = current.children

      // Clear the current node
      current = undefined
      for (const child of children) {
        if ((l = lcp(path, child.prefix, idx)) > 0) {
          current = child
          break
        }
      }
    }
  }

  return
}

/**
 * Internal node for storing {@link Trie} data
 */
interface TrieNode<T> {
  parent?: TrieNode<T>
  prefix: string
  value?: T
  children: TrieNode<T>[]
}
