import type { Optional } from "@telefrek/core/type/utils.js"
import { ExecutionMode } from "@telefrek/query/index.js"
import type { SQLEnum } from "@telefrek/query/sql/types.js"
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql"
import { createPostgresQueryBuilder } from "./builder.js"
import { DefaultPostgresDatabase, type PostgresDatabase } from "./index.js"
import { PostgresConnectionPool } from "./pool.js"
import {
  Category,
  createTestDatabase,
  type TestDatabaseType,
} from "./testUtils.js"

describe("Postgres should be able to execute queries", () => {
  let postgresContainer: Optional<StartedPostgreSqlContainer>
  let pool: Optional<PostgresConnectionPool>
  let executor: Optional<PostgresDatabase>
  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer().start()
    pool = new PostgresConnectionPool({
      name: "testPostgresPool",
      clientConfig: {
        user: postgresContainer.getUsername(),
        password: postgresContainer.getPassword(),
        database: postgresContainer.getDatabase(),
        host: postgresContainer.getHost(),
        port: postgresContainer.getPort(),
        connectionTimeout: 2_000,
      },
    })

    executor = new DefaultPostgresDatabase({ pool })

    await createDatabase()
  }, 60_000)

  async function createDatabase(): Promise<void> {
    if (pool) {
      const client = await pool.get()
      await createTestDatabase(client.item)
      client.release()
    }
  }

  afterAll(async () => {
    if (pool) {
      await pool.shutdown()
    }

    if (postgresContainer) {
      await postgresContainer.stop()
    }
  }, 30_000)

  beforeEach(async () => {
    if (pool) {
      const item = await pool.get()
      const client = item.item

      await client.query("TRUNCATE TABLE customers")
      await client.query("TRUNCATE TABLE orders")
      await client.query("ALTER SEQUENCE customers_id_seq RESTART WITH 1")
      await client.query("ALTER SEQUENCE orders_id_seq RESTART WITH 1")

      item.release()
    }
  })

  it("Should be able to issue a simple query", async () => {
    const insertUserQuery = createPostgresQueryBuilder<TestDatabaseType>()
      .insert("customers")
      .returning("*")
      .build("insertCustomer")

    // Get a value that is 1 too large...
    const big: bigint = BigInt(Number.MAX_SAFE_INTEGER) + 1n

    const insRes = await executor?.run(
      insertUserQuery.bind({
        id: 1n,
        firstName: "test",
        lastName: "customer1",
        createdAt: Date.now(),
        updatedAt: big,
      }),
    )

    const firstUpdate =
      insRes?.mode === ExecutionMode.Normal ? insRes.rows[0].updatedAt : 0

    // We have to use strings here because JEST doesn't support bigint....wtf... https://github.com/jestjs/jest/issues/11617
    expect(firstUpdate.toString()).toBe(big.toString())
    expect(typeof firstUpdate).toBe("bigint")

    const updateUserQuery = createPostgresQueryBuilder<TestDatabaseType>()
      .withParameters<{ id: bigint | number; updatedAt: bigint | number }>()
      .update("customers")
      .set("updatedAt", "updatedAt")
      .where((builder) => builder.eq("id", "id"))
      .returning("updatedAt", "lastName")
      .build("updateCustomer")
      .bind({ id: 1, updatedAt: 9n })

    const updateResult = await executor?.run(updateUserQuery)

    const updateRows =
      updateResult?.mode === ExecutionMode.Normal ? updateResult.rows : []
    expect(updateRows.length).toBe(1)
    expect(updateRows[0].lastName).toBe("customer1")
    expect(updateRows[0].updatedAt).toBe(9) // Ensure the 2n was translated to 2 on the readback...
    expect(typeof updateRows[0].updatedAt).toBe("number")

    await executor?.run(
      createPostgresQueryBuilder<TestDatabaseType>()
        .insert("orders")
        .build("insertCustomer")
        .bind({
          id: 1,
          amount: 10,
          categories: ["purchase"],
          customerId: 1,
          name: "testOrder",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
    )

    const query = createPostgresQueryBuilder<TestDatabaseType>()
      .withParameters<{
        amount: number
        categories: SQLEnum<typeof Category>[]
      }>()
      .withCte("customerOrders", (builder) =>
        builder
          .select("orders")
          .columns("id", "customerId", "categories", "amount")
          .withColumnAlias("id", "orderId")
          .where((clause) =>
            clause.and(
              clause.gt("amount", "amount"),
              clause.containsItems("categories", "categories"),
            ),
          ),
      )
      .withCte("customerNames", (builder) =>
        builder.select("customers").columns("id", "firstName", "lastName"),
      )
      .select("customerOrders")
      .columns("orderId", "amount", "categories")
      .join(
        "customerNames",
        (customerNames) => customerNames.columns("firstName", "lastName"),
        "customerId",
        "id",
      )
      .build("testQuery")

    let result = await executor?.run(
      query.bind({ amount: 1, categories: [Category.PURCHASE] }),
    )

    let rows = result?.mode === ExecutionMode.Normal ? result.rows : []

    expect(rows.length).toBe(1)

    result = await executor?.run(
      createPostgresQueryBuilder<TestDatabaseType>()
        .withCte("customerOrders", (builder) =>
          builder
            .select("orders")
            .columns("id", "customerId", "categories", "amount")
            .withColumnAlias("id", "orderId")
            .where((clause) =>
              clause.and(
                clause.gt("amount", 0),
                clause.containsItems("categories", "test"),
              ),
            ),
        )
        .withCte("customerNames", (builder) =>
          builder.select("customers").columns("id", "firstName", "lastName"),
        )
        .select("customerOrders")
        .columns("orderId", "amount", "categories")
        .join(
          "customerNames",
          (customerNames) => customerNames.columns("firstName", "lastName"),
          "customerId",
          "id",
        )
        .build("testQuery"),
    )

    expect(result).not.toBeUndefined()

    rows = result?.mode === ExecutionMode.Normal ? result.rows : []

    expect(rows.length).toBe(0)

    // Test delete
    const delRes = await executor?.run(
      createPostgresQueryBuilder<TestDatabaseType>()
        .delete("customers")
        .returning("id")
        .where((builder) => builder.eq("id", 1))
        .build("deleteCustomer"),
    )

    const delRows = delRes?.mode === ExecutionMode.Normal ? delRes.rows : []
    expect(delRows.length).toBe(1)
    expect(delRows[0].id).toBe(1)

    result = await executor?.run(
      query.bind({ amount: 1, categories: [Category.PURCHASE] }),
    )

    rows = result?.mode === ExecutionMode.Normal ? result.rows : []
    expect(rows.length).toBe(0)
  })
})
