import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql"
import pg from "pg"
import {
  createPostgresQueryBuilder,
  createRelationalQueryContext,
} from "./builder"
import { PostgresQueryExecutor } from "./executor"
import { createTestDatabase, type TestDatabase } from "./testUtils"

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
  }, 30_000)

  beforeEach(async () => {
    await postgresClient?.query("TRUNCATE TABLE customers")
    await postgresClient?.query("TRUNCATE TABLE orders")
    await postgresClient?.query(
      "ALTER SEQUENCE customers_id_seq RESTART WITH 1",
    )
    await postgresClient?.query("ALTER SEQUENCE orders_id_seq RESTART WITH 1")
  })

  it("Should be able to issue a simple query", async () => {
    const query = createRelationalQueryContext<TestDatabase>()
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
      .build(createPostgresQueryBuilder(), "testQuery")

    const result = await executor?.run(query)
    expect(result).not.toBeUndefined()

    expect(Array.isArray(result?.rows))
    const rows = Array.isArray(result?.rows) ? result.rows : []

    expect(rows.length).toBe(0)
  })
})
