/**
 * Basic implementation of a prefix tree (trie)
 */

import { info } from "console"
import type { Optional } from "../type/utils.js"

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
 * An augmented result that contains parameters as well as the value
 */
export interface ParameterizedPathResult<T> {
  /** The value stored at the path */
  value: T
  /** The parameters that were extracted (if any) */
  parameters?: Map<string, string>
}

/**
 * This is an extended {@link Trie} that behaves in mostly the same way but
 * allows usage of parameters, wildcards and terminal cases
 */
export interface ParameterizedPathTrie<T> {
  /**
   * Check to see if the key is in the trie
   *
   * @param path The path to locate
   *
   * @returns True if the path exists
   */
  has(path: string): boolean

  /**
   * Retrieve the value stored at the path and any parameters extracted
   *
   * @param path The path to locate
   *
   * @returns The object associated with the path if it exists
   */
  get(path: string): Optional<ParameterizedPathResult<T>>

  /**
   * Set the value at the given path
   *
   * @param path The path to store the object at
   * @param obj The value to store that location
   */
  set(path: string, obj: T): void

  /**
   * Remove the value from the trie
   *
   * @param path The path to remove
   *
   * @returns True if the path was in the trie
   */
  remove(path: string): boolean
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

export class DefaultParameterizedPathTrie<T>
  implements ParameterizedPathTrie<T>
{
  private readonly _root: ParameterizedTrieNode<T> = {
    segment: { type: "root" },
    children: [],
  }

  has(path: string): boolean {
    return searchParameterizedTrie(path, this._root)?.value !== undefined
  }

  get(path: string): Optional<ParameterizedPathResult<T>> {
    return searchParameterizedTrie(path, this._root)
  }

  set(path: string, obj: T): void {
    insertParameterizedTrie(path, obj, this._root)
  }

  remove(_path: string): boolean {
    return false
  }
}

///////////////////////////////////////////////////////////////////////////////
//
// Normal Trie implementation
//
///////////////////////////////////////////////////////////////////////////////

/**
 * Internal node for storing {@link Trie} data
 */
interface TrieNode<T> {
  prefix: string
  children: TrieNode<T>[]
  parent?: TrieNode<T>
  value?: T
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
 */
function insertTrie<T>(path: string, value: T, root: TrieNode<T>): void {
  let l = -1
  let idx = 0

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
 * @returns The matching {@link TrieNode}
 */
function searchTrie<T>(path: string, root: TrieNode<T>): Optional<TrieNode<T>> {
  // Setup state variables
  let l = -1
  let idx = 0

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

///////////////////////////////////////////////////////////////////////////////
//
// ParameterizedPathTrie Impl
//
///////////////////////////////////////////////////////////////////////////////

/**
 * Valid segment types for a {@link ParameterizedPath}
 */
type Segment =
  | TextSegment
  | ParameterSegment
  | WildcardSegment
  | TerminalSegment
  | RootSegment

interface ParameterizedTrieNode<T> {
  segment: Segment
  children: ParameterizedTrieNode<T>[]
  parent?: ParameterizedTrieNode<T>
  value?: T
}

/**
 * Definition of a path
 */
type ParameterizedPath = Segment[]

/**
 * A plain text segment
 */
type TextSegment = {
  type: "text"
  prefix: string
}

/**
 * A parameter segment with a name
 */
type ParameterSegment = {
  type: "parameter"
  parameterName: string
}

/**
 * A wildcard segment
 */
type WildcardSegment = {
  type: "wildcard"
}

/**
 * A terminal segment
 */
type TerminalSegment = {
  type: "terminal"
}

/**
 * A root segment
 */
type RootSegment = {
  type: "root"
}

function segmentPath(path: string): ParameterizedPath {
  return [
    {
      type: "text",
      prefix: path,
    },
  ]
}

function insertParameterizedTrie<T>(
  path: string,
  value: T,
  root: ParameterizedTrieNode<T>,
): void {
  let l = -1
  let error: Optional<unknown>

  let current: Optional<ParameterizedTrieNode<T>>
  let last = root
  const children = root.children
  let candidate: Optional<ParameterizedTrieNode<T>>

  const segments = segmentPath(path)

  /**
   * HERE THERE BE DRAGONS
   *
   * Note that everything we do to the trie while inserting must be something we
   * roll back on failures...
   */

  let n: number
  for (n = 0; n < segments.length; ++n) {
    switch (segments[n].type) {
      case "text": {
        // Try to add the segment
        for (const child of children) {
          if (child.segment.type === "text") {
            if ((l = lcp(path, child.segment.prefix)) > 0) {
              candidate = child
              break
            }
          } else {
            candidate = child
            break
          }
        }

        if (candidate) {
          info(`Found candidate, that's unfortunate...${l}`)
        } else {
          // Create the trie from this point on and we're done
          current = {
            parent: last,
            segment: segments[n],
            children: [],
          }

          last.children.push(current)

          last = current

          ++n
          for (; n < segments.length; ++n) {
            const newNode: ParameterizedTrieNode<T> = {
              segment: segments[n],
              parent: last,
              children: [],
            }
            last.children.push(newNode)
            last = newNode
          }

          last.value = value
          return
        }
      }
    }
  }

  // Throw any errors
  if (error) {
    // Rollback...

    throw error
  }
}

function searchParameterizedTrie<T>(
  path: string,
  root: ParameterizedTrieNode<T>,
): Optional<ParameterizedPathResult<T>> {
  let idx = 0
  let l = -1

  let parameters: Optional<Map<string, string>>
  let current: Optional<ParameterizedTrieNode<T>>
  let children = root.children
  let candidate: Optional<ParameterizedTrieNode<T>>

  // We need to find candidates where there is a lcp match or parameter break
  for (const child of children) {
    if (child.segment.type === "text") {
      if ((l = lcp(path, child.segment.prefix)) > 0) {
        candidate = child
        break
      }
    } else {
      candidate = child
      break
    }
  }

  // Check our candidates
  while (candidate) {
    // We have a segment match
    if (l > 0) {
      idx += l

      if (idx === path.length) {
        return candidate.value !== undefined
          ? {
              value: candidate.value,
              parameters,
            }
          : undefined
      } else if (l !== (candidate.segment as TextSegment).prefix.length) {
        // There was a partial match but it wasnt the full segment, bounce it
        return undefined
      } else {
        current = candidate
        candidate = undefined
        children = current.children

        for (const child of children) {
          if (child.segment.type === "text") {
            if ((l = lcp(path, child.segment.prefix)) > 0) {
              candidate = child
              break
            }
          } else {
            candidate = child
            break
          }
        }

        // Continue with our loop
        continue
      }
    }
  }

  return
}
