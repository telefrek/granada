/**
 * Tests for query parsing
 */

import type { ParseSQLQuery } from "./parser.js"

describe("SQL syntax should be correctly identified", () => {
  describe("Select clauses should work", () => {
    it("Should handle a simple select all", () => {
      type query = ParseSQLQuery<"SELECT * FROM table">
      const q: query = {
        type: "SQLQuery",
        query: {
          type: "SelectClause",
          from: {
            type: "TableReference",
            table: "table",
            alias: "table",
          },
          columns: "*",
        },
      }

      expect(q).not.toBeUndefined()
    })

    it("Should handle a simple select with columns", () => {
      type query = ParseSQLQuery<"SELECT col1, col2 FROM table">
      const q: query = {
        type: "SQLQuery",
        query: {
          type: "SelectClause",
          from: {
            type: "TableReference",
            table: "table",
            alias: "table",
          },
          columns: {
            col1: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "col1",
              },
              alias: "col1",
            },
            col2: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "col2",
              },
              alias: "col2",
            },
          },
        },
      }

      expect(q).not.toBeUndefined()
    })

    it("Should handle a simple select with alias columns", () => {
      type query = ParseSQLQuery<`SELECT col1 as c1 FROM table`>
      const q: query = {
        type: "SQLQuery",
        query: {
          type: "SelectClause",
          from: {
            type: "TableReference",
            table: "table",
            alias: "table",
          },
          columns: {
            c1: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "col1",
              },
              alias: "c1",
            },
          },
        },
      }

      expect(q).not.toBeUndefined()
    })

    it("Should handle a simple select all with a table alias", () => {
      type query = ParseSQLQuery<`SELECT * FROM table as t`>
      const q: query = {
        type: "SQLQuery",
        query: {
          type: "SelectClause",
          from: {
            type: "TableReference",
            table: "table",
            alias: "t",
          },
          columns: "*",
        },
      }

      expect(q).not.toBeUndefined()
    })

    it("Should allow alias column with table reference to table alias", () => {
      type query = ParseSQLQuery<`SELECT t.col1 AS c FROM table AS t`>
      const q: query = {
        type: "SQLQuery",
        query: {
          type: "SelectClause",
          from: {
            type: "TableReference",
            table: "table",
            alias: "t",
          },
          columns: {
            c: {
              type: "ColumnReference",
              reference: {
                type: "TableColumnReference",
                table: "t",
                column: "col1",
              },
              alias: "c",
            },
          },
        },
      }

      expect(q).not.toBeUndefined()
    })
  })
})
