/**
 * Shared utilities for testing various aspects of the SQL lib that we don't need to publish
 */

import { createSchemaBuilder } from "./schema.js"
import { SQLBuiltinTypes } from "./types.js"

export const TEST_DATABASE = createSchemaBuilder()
  .addTable("users", (table) =>
    table
      .addColumn("id", SQLBuiltinTypes.BIGINT, { autoIncrement: true })
      .addColumn("first_name", SQLBuiltinTypes.TEXT)
      .addColumn("last_name", SQLBuiltinTypes.TEXT)
      .addColumn("address", SQLBuiltinTypes.TEXT)
      .addColumn("email", SQLBuiltinTypes.TEXT)
      .withKey("id"),
  )
  .addTable("orders", (table) =>
    table
      .addColumn("id", SQLBuiltinTypes.BIGINT, { autoIncrement: true })
      .addColumn("user_id", SQLBuiltinTypes.BIGINT)
      .addColumn("product_id", SQLBuiltinTypes.BIGINT)
      .addColumn("amount", SQLBuiltinTypes.DECIMAL)
      .withKey("user_id", "product_id"),
  )
  .addTable("products", (table) =>
    table
      .addColumn("id", SQLBuiltinTypes.BIGINT, { autoIncrement: true })
      .addColumn("name", SQLBuiltinTypes.TEXT)
      .addColumn("description", SQLBuiltinTypes.TEXT)
      .withKey("id"),
  ).schema
