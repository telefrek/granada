/**
 * Handles mapping order information to the underlying data storage
 */

import { createDatabase } from "@telefrek/postgres"
import { PostgresRow, bind } from "@telefrek/postgres/query"
import { PostgresColumnTypes, PostgresEnum } from "@telefrek/postgres/schema"
import { Order } from "../entities"

const OrderStatus = {
  PLACED: "placed",
  APPROVED: "approved",
  DELIVERED: "delivered",
} as const

interface OrderTable {
  columns: {
    order_id: { type: PostgresColumnTypes.BIGSERIAL }
    pet_id: { type: PostgresColumnTypes.BIGINT }
    quantity: { type: PostgresColumnTypes.INTEGER }
    ship_date: { type: PostgresColumnTypes.TIMESTAMP }
    status: { type: PostgresEnum<typeof OrderStatus> }
    complete: { type: PostgresColumnTypes.BOOLEAN }
  }
}

type OrderRow = PostgresRow<OrderTable>

export interface OrderStore {
  getOrderById(id: number): Promise<Order | undefined>

  createOrder<T extends Omit<Order, "id">>(order: T): Promise<Order>
}

export function createOrderStore(): OrderStore {
  return new PostgresOrderStore()
}

class PostgresOrderStore implements OrderStore {
  async createOrder<T extends Omit<Order, "id">>(order: T): Promise<Order> {
    const database = createDatabase()
    const response = await database.runQuery<
      OrderTable,
      { order_id: number; ship_date: string }
    >(
      bind(
        {
          name: "createOrder",
          text: "INSERT INTO Orders(pet_id, quantity, ship_date, status, complete) VALUES(:pet_id, :quantity, now(), :status, :complete) returning order_id, ship_date",
        },
        order,
      ),
    )

    if (response.hasRows) {
      if (Array.isArray(response.rows)) {
        return {
          ...order,
          id: response.rows[0].order_id,
          shipDate: response.rows[0].ship_date,
        }
      }
    }

    throw new Error("nope")
  }
  async getOrderById(id: number): Promise<Order | undefined> {
    const database = createDatabase()
    const response = await database.runQuery<OrderTable, OrderRow>({
      name: "getOrderById",
      text: `SELECT * FROM Orders WHERE order_id=${id}`,
    })

    if (response.hasRows) {
      if (Array.isArray(response.rows)) {
        return {
          id: response.rows[0].order_id,
          petId: response.rows[0].pet_id,
          shipDate: response.rows[0].ship_date,
          quantity: response.rows[0].quantity,
          status: response.rows[0].status,
          complete: response.rows[0].complete,
        } as Order
      }
    }
  }
}
