/**
 * Basic implementation of a prefix tree (trie)
 */

import {
  type EmptyCallback,
  type MergeTransform,
  type Optional,
} from "../type/utils.js"

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
  parameters: Map<string, string>
}

export interface PartialParameterizedPathResult<T>
  extends ParameterizedPathResult<T> {
  /** The remainder of the search path */
  remainder: string
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
   * Find all potential results along the given path
   *
   * @param path The path to resolve results for
   */
  resolve(path: string): Iterator<PartialParameterizedPathResult<T>>

  /**
   * Set the value at the given path
   *
   * @param path The path to store the object at
   * @param obj The value to store that location
   */
  set(path: string, obj: T): void

  /**
   * Merge the value at the location
   * @param path the path to alter
   * @param merge The {@link MergeTransform} to invoke
   */
  merge(path: string, merge: MergeTransform<T>): void

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

  resolve(
    path: string,
  ): Iterator<PartialParameterizedPathResult<T>, void, undefined> {
    return resolveParameterizedPath(path, this._root)
  }

  set(path: string, obj: T): void {
    insertParameterizedTrie(path, (_) => obj, this._root)
  }

  merge(path: string, merge: MergeTransform<T>): void {
    insertParameterizedTrie(path, merge, this._root)
  }

  remove(path: string): boolean {
    if (!PARAMETERIZED_PATH_REGEX.test(path)) {
      throw new Error(`Invalid path: ${path}`)
    }

    const res = searchParameterizedTrie(path, this._root)
    if (res && res.value !== undefined) {
      // Get the node
      const current = res.node

      // Clear the value
      current.value = undefined

      // Fix the tree
      collapseParameterized(current)

      return true
    }

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
    children.splice(children.indexOf(node), 1)

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
      children.splice(children.indexOf(current), 1)
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
  let idx = 0

  // Get pointers to the current and child nodes
  let current: Optional<TrieNode<T>>
  let children = root.children

  // Search for root child with match
  for (const child of children) {
    // Check for child that starts on the current path
    if (path.startsWith(child.prefix, idx)) {
      current = child
      break
    }
  }

  // Loop until we find it or run out of search space
  while (current !== undefined) {
    // Not a full match, get out
    if (current.prefix.length + idx === path.length) {
      // Full match
      return current
    } else {
      idx += current.prefix.length // Add the prefix length
      children = current.children

      // Clear the current node
      current = undefined
      for (const child of children) {
        if (path.startsWith(child.prefix, idx)) {
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
 * Internal extension for the {@link ParameterizedPathResult}
 */
interface ExtendedParameterizedPathResult<T>
  extends ParameterizedPathResult<T> {
  node: ParameterizedTrieNode<T>
}

/**
 * Valid segment types for a {@link ParameterizedPath}
 */
type Segment =
  | TextSegment
  | ParameterSegment
  | WildcardSegment
  | TerminalSegment
  | RootSegment

/**
 * A node for a {@link ParameterizedTrie}
 */
interface ParameterizedTrieNode<T> {
  /** The {@link Segment} at this position */
  segment: Segment
  /** The children of this node */
  children: ParameterizedTrieNode<T>[]
  /** The parent of this segment */
  parent?: ParameterizedTrieNode<T>
  /** The value at this path if one was set */
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

const PARAMETERIZED_PATH_REGEX =
  /^(\/(:[a-zA-Z])?([a-zA-Z0-9_-]+|\*{1,2}))+\/?$/

const PATH_SEPARATOR = "/"
const WILDCARD = "*"
const TERMINATOR = "**"
const URI_SEGMENT_REGEX = /^[a-zA-Z0-9-]+$/
const PARAMETER_REGEX = /^:[a-zA-Z][0-9a-zA-Z_]*$/

/**
 * Parse the path into a {@link ParameterizedPath}
 *
 * @param path The path to divide into {@link Segment} chunks
 * @returns A {@link ParameterizedPath}
 */
function _segmentPath(path: string): ParameterizedPath {
  const segments: ParameterizedPath = []
  let current = ""

  // Split the path into chunks
  const split = path.split(PATH_SEPARATOR)

  for (let n = 0; n < split.length; ++n) {
    const segment = split[n]
    switch (true) {
      case URI_SEGMENT_REGEX.test(segment):
        current += `/${segment}`
        break
      case segment === WILDCARD:
        if (current.length > 0) {
          segments.push({ type: "text", prefix: current + "/" })
          current = ""
        } else {
          segments.push({ type: "text", prefix: "/" })
        }
        segments.push({ type: "wildcard" })
        break
      case segment === TERMINATOR:
        if (current.length > 0) {
          segments.push({ type: "text", prefix: current + "/" })
          current = ""
        } else {
          segments.push({ type: "text", prefix: "/" })
        }
        segments.push({ type: "terminal" })
        if (n < split.length - 1) {
          throw new Error(
            `Cannot have a termination before the end of the segment ${path}`,
          )
        }
        return segments
      case PARAMETER_REGEX.test(segment):
        if (current.length > 0) {
          segments.push({ type: "text", prefix: current + "/" })
          current = ""
        } else {
          segments.push({ type: "text", prefix: "/" })
        }
        segments.push({
          type: "parameter",
          parameterName: segment.substring(1),
        })
        break
    }
  }

  if (current.length > 0) {
    segments.push({ type: "text", prefix: current })
    current = ""
  } else if (segments.length === 0) {
    segments.push({ type: "text", prefix: "/" })
  }

  return segments
}

interface Modification<T> {
  node: ParameterizedTrieNode<T>
  rollback: EmptyCallback
}

/**
 * Insert the segment into the children and return a modification
 *
 * @param children The target set of children to add to
 * @param segment The {@link Segment} to add
 * @returns A {@link Modification} for this operation
 */
function _insertSegment<T>(
  parent: ParameterizedTrieNode<T>,
  segment: Segment,
): Modification<T> {
  const newNode = <ParameterizedTrieNode<T>>{
    segment,
    parent,
    children: [],
  }

  parent.children.push(newNode)

  return {
    node: newNode,
    rollback: () => {
      // Remove this new node
      parent.children.splice(parent.children.indexOf(newNode), 1)
    },
  }
}

/**
 * Split the node and add the segment which may be covered or covering
 *
 * @param original The original {@link ParameterizedTrieNode}
 * @param target The new {@link ParameterizedTrieNode} that is being added
 * @param len The length of the LCP between the two nodes
 *
 * @returns An {@link Modification} with the results and rollback
 */
function _splitNode<T>(
  original: ParameterizedTrieNode<T>,
  target: TextSegment,
  len: number,
): Modification<T> {
  const parent = original.parent!
  const left = original.segment as TextSegment
  const leftSplit = len === target.prefix.length

  const newParent = <ParameterizedTrieNode<T>>{
    segment: {
      type: "text",
      prefix: left.prefix.substring(0, len),
    },
    children: [original],
    parent: original.parent,
  }

  original.parent = newParent
  original.segment = {
    type: "text",
    prefix: left.prefix.substring(len),
  }
  const idx = parent.children.indexOf(original)
  parent.children.splice(idx, 1)
  parent.children.push(newParent)

  let newNode = newParent
  if (!leftSplit) {
    newNode = <ParameterizedTrieNode<T>>{
      segment: {
        type: "text",
        prefix: target.prefix.substring(len),
      },
      children: [],
      parent: newParent,
    }
    newParent.children.push(newNode)
  }

  return {
    node: newNode,
    rollback: () => {
      // Remove the new parent (which may be the new node) from the trie
      parent.children.splice(parent.children.indexOf(newParent), 1)

      // Re-add the original and restore it's properties
      parent.children.push(original)
      original.parent = parent
      original.segment = left

      newParent.children = [] // Remove any links to other nodes
    },
  }
}

function insertParameterizedTrie<T>(
  path: string,
  merge: MergeTransform<T>,
  root: ParameterizedTrieNode<T>,
): void {
  const undoStack: EmptyCallback[] = []
  let error: Optional<Error>
  let l = -1
  let current = root
  let children = root.children

  // Verify the path
  if (!PARAMETERIZED_PATH_REGEX.test(path) && path !== "/") {
    throw new Error(`Invalid path: ${path}`)
  }

  // Clean the path
  path = _cleanPath(path)

  // Create the path segments
  for (const segment of _segmentPath(path)) {
    // Stop if there is an error
    if (error) {
      break
    }
    // Clear the previous lookup
    l = -1

    switch (segment.type) {
      case "text":
        {
          let match: Optional<ParameterizedTrieNode<T>>
          do {
            if (children.some((c) => c.segment.type === "terminal")) {
              error = new Error(
                `There is a terminal preventing text ${segment.prefix}`,
              )
              break
            }

            match = children.find(
              (c) =>
                c.segment.type === "text" &&
                (l = lcp(segment.prefix, c.segment.prefix)) > 0,
            )

            // Covering match
            if (match && (match.segment as TextSegment).prefix.length === l) {
              segment.prefix = segment.prefix.substring(l)
              current = match
              children = current.children
              l = -1
            } else if (match) {
              current = match
              match = undefined
              children = current.children
            }
          } while (match !== undefined)

          // If the segment is a full match, no further work needed
          if (segment.prefix.length > 0) {
            const modification =
              l > 0
                ? _splitNode(current, segment, l)
                : _insertSegment(current, segment)

            current = modification.node
            children = current.children
            undoStack.push(modification.rollback)
          }
        }
        break
      case "parameter":
        {
          if (
            children.some(
              (c) =>
                c.segment.type === "wildcard" || c.segment.type === "terminal",
            )
          ) {
            error = new Error(
              `There is a wildcard or terminal preventing parameter ${segment.parameterName}`,
            )
            continue
          }

          const parameter = children.find((c) => c.segment.type === "parameter")
          if (
            parameter &&
            (parameter.segment as ParameterSegment).parameterName !==
              segment.parameterName
          ) {
            error = new Error(
              `There is already another parameter at this position with a different name ${segment.parameterName} (${(parameter.segment as ParameterSegment).parameterName})`,
            )
          } else if (parameter) {
            current = parameter
            children = current.children
            continue
          } else {
            const modification = _insertSegment(current, segment)
            undoStack.push(modification.rollback)
            current = modification.node
            children = current.children
          }
        }
        break
      case "wildcard":
        {
          if (
            children.some(
              (c) =>
                c.segment.type === "parameter" || c.segment.type === "terminal",
            )
          ) {
            error = new Error(
              `There is a parameter or terminal preventing wildcard segment`,
            )
            continue
          }

          const wildcard = children.find((c) => c.segment.type === "wildcard")
          if (wildcard) {
            current = wildcard
            children = current.children
          } else {
            const modification = _insertSegment(current, segment)
            undoStack.push(modification.rollback)
            current = modification.node
            children = current.children
          }
        }
        break
      case "terminal":
        if (children.some((c) => c.segment.type !== "text")) {
          error = new Error(
            `There is another special case preventing addition of terminal`,
          )
          continue
        } else {
          const modification = _insertSegment(current, segment)
          undoStack.push(modification.rollback)
          current = modification.node
          children = current.children
        }
        break
    }
  }

  try {
    current.value = merge(current.value)
  } catch (err) {
    error =
      err instanceof Error ? err : new Error("merge error", { cause: err })
  }

  // Check for errors
  if (error) {
    // Run all of the undo operatoins
    for (const operation of undoStack) {
      operation()
    }

    // Throw the error
    throw error
  }

  // Sort the nodes
  while (current.parent) {
    current.children.sort(_sortParameterizedTrieNode)
    current = current.parent
  }

  current.children.sort(_sortParameterizedTrieNode)
}

function _sortParameterizedTrieNode<T>(
  left: ParameterizedTrieNode<T>,
  right: ParameterizedTrieNode<T>,
): number {
  switch (left.segment.type) {
    case "text":
      switch (right.segment.type) {
        case "text":
          return left.segment.prefix.localeCompare(right.segment.prefix)
        default:
          return -1
      }
    case "parameter":
      switch (right.segment.type) {
        case "text":
          return 1
        default:
          return -1
      }
    case "wildcard":
      switch (right.segment.type) {
        case "text":
          return 1
        default:
          return 0
      }
    case "terminal":
      switch (right.segment.type) {
        case "text":
          return 1
        default:
          return 0
      }
  }

  return 0
}

function _cleanPath(path: string): string {
  return (
    "/" +
    path
      .split("/")
      .filter((p) => p.length > 0)
      .join("/")
  )
}

/**
 * Resolve all possible values along the path
 *
 * @param path The path to resolve
 * @param root The starting {@link ParameterizedTrieNode}
 * @returns An {@link Iterator} with the possible
 * {@link ParameterizedPathResult} along the path
 */
function* resolveParameterizedPath<T>(
  path: string,
  root: ParameterizedTrieNode<T>,
): Generator<PartialParameterizedPathResult<T>, void, unknown> {
  let idx = 0
  let l = -1
  let current: Optional<ParameterizedTrieNode<T>>
  let children = root.children
  const parameters = new Map<string, string>()
  path = _cleanPath(path)

  const search = () => {
    for (const child of children) {
      switch (child.segment.type) {
        case "text":
          if (path.startsWith(child.segment.prefix, idx)) {
            current = child
            return
          }
          break
        default:
          current = child
          l =
            path.at(idx) === "/"
              ? path.indexOf("/", idx + 1)
              : path.indexOf("/", idx)
          return
      }
    }
  }

  search()

  while (current) {
    switch (current.segment.type) {
      case "text":
        idx += current.segment.prefix.length
        break
      case "parameter":
        parameters.set(
          current.segment.parameterName,
          path.at(idx) === "/"
            ? path.substring(idx + 1, l < 0 ? undefined : l)
            : path.substring(idx, l < 0 ? undefined : l),
        )
        idx = l < 0 ? path.length : l
        break
      case "wildcard":
        idx = l < 0 ? path.length : l
        break
      case "terminal":
        idx = path.length
        break
    }

    if (current.value !== undefined) {
      yield {
        value: current.value,
        parameters,
        remainder: path.substring(idx),
      }
    }

    if (idx === path.length) {
      return
    }

    children = current.children
    current = undefined
    search()
  }

  return
}

/**
 * Search the {@link ParameterizedPathTrie} for the given path
 *
 * @param path The path to search for
 * @param root The root {@link ParameterizedTrieNode} to search from
 * @returns A {@link ParameterizedPathResult} if one is found
 */
function searchParameterizedTrie<T>(
  path: string,
  root: ParameterizedTrieNode<T>,
): Optional<ExtendedParameterizedPathResult<T>> {
  let idx = 0
  let l = -1
  let current: Optional<ParameterizedTrieNode<T>>
  let children = root.children
  const parameters = new Map<string, string>()
  path = _cleanPath(path)

  const search = () => {
    for (const child of children) {
      switch (child.segment.type) {
        case "text":
          if (path.startsWith(child.segment.prefix, idx)) {
            current = child
            return
          }
          break
        default:
          current = child
          l =
            path.at(idx) === "/"
              ? path.indexOf("/", idx + 1)
              : path.indexOf("/", idx)
          return
      }
    }
  }

  search()

  while (current) {
    switch (current.segment.type) {
      case "text":
        idx += current.segment.prefix.length
        break
      case "parameter":
        parameters.set(
          current.segment.parameterName,
          path.at(idx) === "/"
            ? path.substring(idx + 1, l < 0 ? undefined : l)
            : path.substring(idx, l < 0 ? undefined : l),
        )
        idx = l < 0 ? path.length : l
        break
      case "wildcard":
        idx = l
        break
      case "terminal":
        idx = path.length
        break
    }

    if (idx === path.length) {
      return current.value !== undefined
        ? {
            value: current.value,
            parameters,
            node: current,
          }
        : undefined
    }

    children = current.children
    current = undefined
    search()
  }

  return
}

/**
 * Cleanup the trie when we remove data from a node
 *
 * @param node The {@link TrieNode} that changed
 */
function collapseParameterized<T>(node: ParameterizedTrieNode<T>): void {
  // We have children that potentially need adjusting
  if (node.children.length === 0 && node.parent) {
    const children = node.parent.children
    children.splice(children.indexOf(node), 1)

    // Collapse up the tree
    if (node.parent.value === undefined) {
      collapseParameterized(node.parent!)
    }
  } else if (node.children.length === 1) {
    // Collapse the child with this node
    const child = node.children[0]
    if (node.segment.type === "text" && child.segment.type === "text") {
      node.segment.prefix = node.segment.prefix + child.segment.prefix
    } else {
      node.segment = child.segment
    }
    node.children = child.children
    node.value = child.value

    child.children.forEach((c) => (c.parent = node))
  }
}
