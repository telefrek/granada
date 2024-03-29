import type { SQLEnum } from "@telefrek/query/sql/types"
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql"
import pg from "pg"
import { createPostgresQueryContext } from "./builder"
import { PostgresQueryExecutor } from "./executor"
import {
  Category,
  createTestDatabase,
  type TestDatabaseType,
} from "./testUtils"

describe("Postgres should be able to execute queries", () => {
  let postgresContainer: StartedPostgreSqlContainer | undefined
  let postgresClient: pg.Client | undefined
  let executor: PostgresQueryExecutor | undefined

  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer().start()
    postgresClient = new pg.Client({
      connectionString: postgresContainer.getConnectionUri(),
    })
    await postgresClient.connect()

    await createTestDatabase(postgresClient)

    executor = new PostgresQueryExecutor(postgresClient)
  }, 60_000)

  afterAll(async () => {
    if (postgresClient) {
      await postgresClient.end()
    }

    if (postgresContainer) {
      await postgresContainer.stop()
    }
  })

  beforeEach(async () => {
    await postgresClient?.query("TRUNCATE TABLE customers")
    await postgresClient?.query("TRUNCATE TABLE orders")
    await postgresClient?.query(
      "ALTER SEQUENCE customers_id_seq RESTART WITH 1",
    )
    await postgresClient?.query("ALTER SEQUENCE orders_id_seq RESTART WITH 1")
  })

  it("Should be able to issue a simple query", async () => {
    const insertUserQuery = createPostgresQueryContext<TestDatabaseType>()
      .insert("customers", [
        "id",
        "firstName",
        "lastName",
        "createdAt",
        "updatedAt",
      ])
      .returning("*")
      .build("insertCustomer")

    await executor?.run(
      insertUserQuery.bind({
        id: 1n,
        firstName: "test",
        lastName: "customer1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    )

    await executor?.run(
      createPostgresQueryContext<TestDatabaseType>()
        .insert("orders", [
          "id",
          "amount",
          "categories",
          "customerId",
          "createdAt",
          "updatedAt",
        ])
        .build("insertCustomer")
        .bind({
          id: 1,
          amount: 10,
          categories: ["purchase"],
          customerId: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
    )

    const query = createPostgresQueryContext<TestDatabaseType>()
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
    expect(result).not.toBeUndefined()

    expect(Array.isArray(result?.rows))
    let rows = Array.isArray(result?.rows) ? result.rows : []

    expect(rows.length).toBe(1)

    result = await executor?.run(
      createPostgresQueryContext<TestDatabaseType>()
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

    expect(Array.isArray(result?.rows))
    rows = Array.isArray(result?.rows) ? result.rows : []

    expect(rows.length).toBe(0)
  }, 180_000)
})
