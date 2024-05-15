/**
 * Tests for the Trie structures
 */

import { DefaultParameterizedPathTrie, DefaultTrie } from "./trie.js"

describe("A ParameterizedTrie should work for all use and edge cases", () => {
  it("Should allow normal trie behavior", () => {
    const trie = new DefaultParameterizedPathTrie<number>()

    expect(trie.has("foo")).toBeFalsy()
    expect(trie.has("/foo")).toBeFalsy()
    expect(trie.get("/foo")).toBeUndefined()

    trie.set("/foo", 1)
    expect(trie.has("/foo")).toBeTruthy()
    expect(trie.get("/foo")?.value).toBe(1)
    expect(trie.get("foo")).toBeUndefined()

    // Test an invalid path
    expect(() => trie.set("foo", 1)).toThrow()
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
