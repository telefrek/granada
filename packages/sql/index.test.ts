/**
 * General tests for the package
 */

import type { ExtractSQLQuery } from "./validation.js"

type t = ExtractSQLQuery<"update foo set bar=1 where name='sure' returning id">

// LOLOLOLOLOL
const f: t = {
  type: "SQLQuery",
  query: {
    type: "UpdateClause",
    columns: [
      {
        type: "ColumnAssignment",
        column: {
          type: "ColumnReference",
          alias: "bar",
          reference: {
            type: "UnboundColumnReference",
            column: "bar",
          },
        },
        value: {
          type: "StringValue",
          value: "1",
        },
      },
    ],
    table: {
      type: "TableReference",
      table: "foo",
      alias: "foo",
    },
    where: {
      type: "StringValue",
      value: "name='sure'",
    },
    returning: [
      {
        type: "TableColumnReference",
        table: "foo",
        column: "id",
      },
    ],
  },
}

type t2 = ExtractSQLQuery<"delete foo where id=1 returning name, address">
type t3 = ExtractSQLQuery<"select foo">
