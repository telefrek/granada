/**
 * Tests for the Trie structures
 */

import type { Optional } from "../type/utils.js"
import {
  DefaultParameterizedPathTrie,
  DefaultTrie,
  type ParameterizedPathResult,
} from "./trie.js"

describe("A ParameterizedTrie should work for all use and edge cases", () => {
  it("Should allow normal trie behavior", () => {
    const trie = new DefaultParameterizedPathTrie<number>()

    let res: Optional<ParameterizedPathResult<number>>

    trie.set("/foo", 1)
    trie.set("/fold", 2)
    trie.set("/fold/one", 3)
    trie.set("/fold/:foo", 4)
    trie.set("/fold/:foo/bar", 5)
    trie.set("/*/foo", 6)
    trie.set("/*/foo/:bar", 7)
    trie.set("/cat/**", 8)

    const it = trie.resolve("/fold/foo/bar")
    expect((it.next().value as ParameterizedPathResult<number>).value).toBe(2)
    expect((it.next().value as ParameterizedPathResult<number>).value).toBe(4)
    expect((it.next().value as ParameterizedPathResult<number>).value).toBe(5)
    expect(it.next().done).toBeTruthy()

    expect(trie.has("/foo")).toBeTruthy()
    expect(trie.get("/foo")?.value).toBe(1)
    expect(trie.get("/fold")?.value).toBe(2)
    expect(trie.get("/fold/one")?.value).toBe(3)
    res = trie.get("/fold/two")
    expect(res).not.toBeUndefined()
    expect(res?.value).toBe(4)
    expect(res?.parameters?.size).toBe(1)
    expect(res?.parameters?.get(":foo")).toBe("two")
    res = trie.get("/fold/bar/bar")
    expect(res).not.toBeUndefined()
    expect(res?.value).toBe(5)
    expect(res?.parameters?.size).toBe(1)
    expect(res?.parameters?.get(":foo")).toBe("bar")
    expect(trie.get("/silly/foo")?.value).toBe(6)
    expect(trie.get("/1/foo/")?.value).toBe(6)
    expect(trie.get("/cat/one/two/three")?.value).toBe(8)
    expect(() => trie.set(`/first/two/three/four/**/five`, -1)).toThrow()
    expect(trie.get("/first")).toBeUndefined()

    expect(trie.remove("/cat/**")).toBeTruthy()
    expect(trie.remove("/cat/**")).toBeFalsy()
    expect(trie.get("/cat/one/two/three")?.value).toBeUndefined()
  }, 600_000)
})

describe("A Trie should work for all use and edge cases", () => {
  it("Should allow happy path manipulations", () => {
    const trie = new DefaultTrie<number>()

    expect(trie.has("foo")).toBeFalsy()
    expect(trie.get("foo")).toBeUndefined()
    trie.set("foo", 1)
    expect(trie.has("foo")).toBeTruthy()
    expect(trie.get("foo")).toBe(1)

    expect(trie.remove("foo")).toBeTruthy()
    expect(trie.remove("foo")).toBeFalsy()
    expect(trie.has("foo")).toBeFalsy()
    expect(trie.get("foo")).toBeUndefined()
  })

  it("Should work with splitting", () => {
    const trie = new DefaultTrie<number>()

    trie.set("and", 1)
    trie.set("ant", 2)

    expect(trie.has("and")).toBeTruthy()
    expect(trie.get("and")).toBe(1)

    expect(trie.has("ant")).toBeTruthy()
    expect(trie.get("ant")).toBe(2)

    expect(trie.remove("ant")).toBeTruthy()
    expect(trie.has("and")).toBeTruthy()
    expect(trie.get("and")).toBe(1)

    expect(trie.has("an")).toBeFalsy()
    expect(trie.has("a")).toBeFalsy()
    expect(trie.has("ant")).toBeFalsy()

    trie.set("a", 3)
    expect(trie.has("a")).toBeTruthy()
    expect(trie.get("a")).toBe(3)
    expect(trie.get("and")).toBe(1)
    expect(trie.remove("a")).toBeTruthy()
    expect(trie.get("and")).toBe(1)
  })

  it("Should work with deep nesting", () => {
    const trie = new DefaultTrie<number>()

    const words = [
      "a",
      "at",
      "ax",
      "ate",
      "atom",
      "anomoly",
      "and",
      "as",
      "astroid",
      "astrid",
      "aspire",
      "asparagus",
    ]

    for (let n = 0; n < words.length; ++n) {
      trie.set(words[n], n)
    }

    for (let n = 0; n < words.length; ++n) {
      expect(trie.has(words[n])).toBeTruthy()
      expect(trie.get(words[n])).toBe(n)
    }

    while (words.length > 0) {
      expect(trie.remove(words.pop()!)).toBeTruthy()

      for (let n = 0; n < words.length; ++n) {
        expect(trie.has(words[n])).toBeTruthy()
        expect(trie.get(words[n])).toBe(n)
      }
    }
  })
})
