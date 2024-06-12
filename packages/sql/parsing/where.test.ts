import type { ParseWhereClause } from "./where.js"

/**
 * Note these tests aren't actual "tests" in the normal sense however they will
 * cause the build to fail if the types become corrupted so they help detect
 * issues with the underlying parsing behaviors
 */

describe("Where clause parsing should handle reasonable cases", () => {
  describe("value types should be identified correctly", () => {
    it("Should identify strings", () => {
      const q: ParseWhereClause<`WHERE c = 'Hello'`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "StringValue",
            value: "Hello",
          },
        },
      }
      expect(q).not.toBeUndefined()
    })

    it("Should identify multiline strings", () => {
      const q: ParseWhereClause<`WHERE c = 'Hello World'`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "StringValue",
            value: "Hello World",
          },
        },
      }
      expect(q).not.toBeUndefined()
    })

    it("Should identify numbers", () => {
      const q1: ParseWhereClause<`WHERE c = 4`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "NumberValue",
            value: 1,
          },
        },
      }

      expect(q1).not.toBeUndefined()

      const q2: ParseWhereClause<`WHERE c = 0`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "NumberValue",
            value: 1,
          },
        },
      }

      expect(q2).not.toBeUndefined()
    })

    it("Should identify binary data", () => {
      const q: ParseWhereClause<`WHERE c = 0xab`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "BufferValue",
            value: Int8Array.of(1),
          },
        },
      }

      expect(q).not.toBeUndefined()
    })

    it("Should identify boolean data", () => {
      const f: ParseWhereClause<`WHERE c = false`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "BooleanValue",
            value: false,
          },
        },
      }

      expect(f).not.toBeUndefined()

      const t: ParseWhereClause<`WHERE c = true`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "BooleanValue",
            value: true,
          },
        },
      }

      expect(t).not.toBeUndefined()
    })

    it("Should identify null data", () => {
      const q: ParseWhereClause<`WHERE c = null`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "NullValue",
            value: null,
          },
        },
      }

      expect(q).not.toBeUndefined()
    })

    it("Should identify parameters", () => {
      const n: ParseWhereClause<`WHERE c = :id`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "ParameterValue",
            name: "id",
          },
        },
      }

      expect(n).not.toBeUndefined()

      const i: ParseWhereClause<`WHERE c = $0`> = {
        where: {
          type: "ColumnFilter",
          left: {
            type: "ColumnReference",
            reference: {
              type: "UnboundColumnReference",
              column: "c",
            },
            alias: "c",
          },
          op: "=",
          right: {
            type: "ParameterValue",
            name: "0",
          },
        },
      }

      expect(i).not.toBeUndefined()
    })
  })

  describe("Should identify invalid types", () => {
    it("Shouldn't allow unquoted strings", () => {
      const q: ParseWhereClause<`WHERE id = test`> =
        "invalid expression: id = test"
      expect(q).not.toBeUndefined()
    })

    it("Shouldn't allow invalid operators", () => {
      const q1: ParseWhereClause<`WHERE id === 'test'`> =
        "invalid expression: id =  =  = 'test'"
      expect(q1).not.toBeUndefined()

      const q2: ParseWhereClause<`WHERE id <>> 1`> =
        "invalid expression: id <>  > 1"
      expect(q2).not.toBeUndefined()

      const q3: ParseWhereClause<`WHERE id not equals 1`> =
        "invalid expression: id NOT equals 1"
      expect(q3).not.toBeUndefined()

      const q4: ParseWhereClause<`WHERE id AND 1`> =
        "invalid expression: id AND 1"
      expect(q4).not.toBeUndefined()
    })
  })

  describe("Should be able to identify non-normalized logical trees", () => {
    it("Should identify a non-spaced but valid column filter", () => {
      const q: ParseWhereClause<`WHERE ( id=1 ) anD ( id< 4 )`> = {
        where: {
          type: "LogicalTree",
          left: {
            type: "ColumnFilter",
            left: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "id",
              },
              alias: "id",
            },
            op: "=",
            right: {
              type: "NumberValue",
              value: 1,
            },
          },
          op: "AND",
          right: {
            type: "ColumnFilter",
            left: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "id",
              },
              alias: "id",
            },
            op: "<",
            right: {
              type: "NumberValue",
              value: 1,
            },
          },
        },
      }

      expect(q).not.toBeUndefined()
    })
  })

  describe("Logical trees should be identified correctly", () => {
    it("Should identify a simple compound clause", () => {
      const q: ParseWhereClause<`WHERE id > 2 AND id < 4`> = {
        where: {
          type: "LogicalTree",
          left: {
            type: "ColumnFilter",
            left: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "id",
              },
              alias: "id",
            },
            op: ">",
            right: {
              type: "NumberValue",
              value: 0,
            },
          },
          op: "AND",
          right: {
            type: "ColumnFilter",
            left: {
              type: "ColumnReference",
              reference: {
                type: "UnboundColumnReference",
                column: "id",
              },
              alias: "id",
            },
            op: "<",
            right: {
              type: "NumberValue",
              value: 0,
            },
          },
        },
      }

      expect(q).not.toBeUndefined()
    })
  })
})
