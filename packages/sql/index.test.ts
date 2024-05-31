/**
 * General tests for the package
 */

import type { ExtractSQLQuery } from "./validation.js"

type t = ExtractSQLQuery<"update foo set bar=1 where name='sure' returning id">
type t2 = ExtractSQLQuery<"delete foo where id=1 returning name, address">
type t3 = ExtractSQLQuery<"select foo">
