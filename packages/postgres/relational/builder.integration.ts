import { and, containsItems, gt } from "@telefrek/data/relational/builder/index"
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql"
import pg from "pg"
import { PostgresQueryBuilder, createRelationalQueryContext } from "./builder"
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

  it("Should be able to issue a simple query", async () => {
    const query = createRelationalQueryContext<TestDatabase>()
      .withCte("customerOrders", (builder) =>
        builder
          .from("orders")
          .select("id", "customerId", "categories", "amount")
          .alias("id", "orderId")
          .where(and(gt("amount", 0), containsItems("categories", "test"))),
      )
      .withCte("customerNames", (builder) =>
        builder.from("customers").select("id", "firstName", "lastName"),
      )
      .from("customerOrders")
      .select("orderId", "amount", "categories")
      .join(
        "customerNames",
        (customerNames) => customerNames.select("firstName", "lastName"),
        "customerId",
        "id",
      )
      .build(PostgresQueryBuilder, "testQuery")

    const result = await executor?.run(query)
    expect(result).not.toBeUndefined()

    expect(Array.isArray(result?.rows))
    const rows = Array.isArray(result?.rows) ? result.rows : []

    expect(rows.length).toBe(0)
  })
})
