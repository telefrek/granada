/**
 * This package contains the petstore service api
 */

import { HttpMethod } from "@telefrek/http"
import { SerializationFormat, routableApi, route } from "@telefrek/service"
import { OrderStore } from "./dataAccess/orders"
import { Order } from "./entities"

@routableApi({ pathPrefix: "/pet" })
export class PetApi {}

/**
 * The {@link RoutableApi} for handling the ordre store
 */
@routableApi({ pathPrefix: "/store", format: SerializationFormat.JSON })
export class StoreApi {
  readonly #orderStore: OrderStore

  /**
   * Ctor for the {@link StoreApi}
   *
   * @param orderStore The {@link OrderStore} to use
   */
  constructor(orderStore: OrderStore) {
    this.#orderStore = orderStore
  }

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
  placeOrder(order: Omit<Order, "id">): Promise<Order> {
    return this.#orderStore.createOrder(order)
  }

  @route({
    template: "/order/{orderId}",
    method: HttpMethod.GET,
    parameters: ["orderId"],
  })
  async getOrder(orderId: number): Promise<Order | undefined> {
    return await this.#orderStore.getOrderById(orderId)
  }

  @route({
    template: "/order/{orderId}",
    method: HttpMethod.DELETE,
    parameters: ["orderId"],
  })
  async deleteOrder(orderId: number): Promise<void> {
    if (await this.#orderStore.getOrderById(orderId)) {
      return Promise.resolve(undefined)
    }

    return Promise.resolve(undefined)
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
      colleenIsAwesome: 3,
    })
  }
}

@routableApi({ pathPrefix: "/user" })
export class UserApi {}
