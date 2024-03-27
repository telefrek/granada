import { getDebugInfo } from "@telefrek/core"
import type {
  ColumnDefinition,
  DatabaseTables,
  SQLDatabase,
  SQLDatabaseRowSchema,
  SQLTableDefinition,
  SQLTableRowSchema,
} from "./schema"
import { TestDatabase } from "./testUtils"
import { SQLColumnType } from "./types"

describe("The type system should allow translation between types", () => {
  it("should map correctly between TS and SQL schema objects", () => {
    const database = TestDatabase

    const schema = database.tables.orders.columns
    expect(schema.id).toEqual(SQLColumnType.BIGINT)
    expect(schema.name).toEqual(SQLColumnType.TEXT)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validateSchema = <T extends SQLTableDefinition<any>>(
      _table: T,
      _row: SQLTableRowSchema<T["columns"]>,
    ): boolean => {
      return true
    }

    const checkSchema = <
      D extends SQLDatabase<DatabaseTables>,
      K extends keyof D["tables"],
    >(
      _database: D,
      _table: K,
      provider: () => SQLDatabaseRowSchema<D>[K],
    ): SQLDatabaseRowSchema<D>[K] => {
      return provider()
    }

    const rows = checkSchema(database, "orders", () => {
      return {
        id: 1n,
        name: "foo",
        customerId: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        amount: 1.0,
      }
    })

    expect(validateSchema(database.tables.orders, rows)).toBeTruthy()

    const checkDef = <ColumnType extends SQLColumnType>(
      definition: ColumnDefinition<ColumnType>,
    ): void => {
      console.log(getDebugInfo(definition))
    }

    checkDef({
      type: SQLColumnType.TEXT,
      nullable: false,
    })
  })
})
