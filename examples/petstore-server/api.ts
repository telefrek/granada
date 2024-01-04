/**
 * This package contains the petstore service api
 */

import { HttpMethod } from "@telefrek/http"
import { SerializationFormat, routableApi, route } from "@telefrek/service"

@routableApi({ pathPrefix: "/pet" })
export class PetApi {}

/**
 * The interface that represents an order
 */
export interface Order {
  id: number
  petId: number
  quantity: number
  shipDate: string
  status: "placed" | "approved" | "delivered"
  complete: boolean
}

@routableApi({ pathPrefix: "/store", format: SerializationFormat.JSON })
export class StoreApi {
  #orders = new Map<number, Order>()

  /**
   * Places an order
   *
   * @param order The {@link Order} to place
   * @returns The accepted {@link Order} object
   */
  @route({
    template: "/order",
    method: HttpMethod.POST,
  })
  async placeOrder(order: Order): Promise<Order> {
    let lookup = this.#orders.get(order.id)
    if (lookup === undefined) {
      lookup = order
      this.#orders.set(lookup.id, lookup)
      lookup.status = "placed"
    }

    return Promise.resolve(lookup)
  }

  @route({
    template: "/order/{orderId}",
    method: HttpMethod.POST,
  })
  async getOrder(orderId: number): Promise<Order | undefined> {
    return Promise.resolve(this.#orders.get(orderId))
  }

  @route({
    template: "/order/{orderId}",
    method: HttpMethod.DELETE,
  })
  async deleteOrder(orderId: number): Promise<void> {
    this.#orders.delete(orderId)
    return Promise.resolve()
  }

  /**
   * Find the inventory for the store
   *
   * @returns The current inventory volumes
   */
  @route({
    template: "/inventory",
    method: HttpMethod.GET,
    format: SerializationFormat.JSON,
  })
  async getInventory(): Promise<Record<string, number>> {
    return Promise.resolve({
      additionalProp1: 0,
      additionalProp2: 0,
      additionalProp3: 0,
    })
  }
}

@routableApi({ pathPrefix: "/user" })
export class UserApi {}
