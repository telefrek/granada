/**
 * Service definition and tooling for tests
 */

import { getDebugInfo } from "@telefrek/core"
import type { Optional } from "@telefrek/core/type/utils"
import { HttpMethod } from "@telefrek/http/index.js"
import { TEST_LOGGER } from "@telefrek/http/testUtils"
import type { RoutingParameters } from "../http/routing.js"
import { routableApi, route } from "./decorators.js"
import { SerializationFormat, type ServiceResponse } from "./index.js"

export interface TestItem {
  id: number
  name: string
  createdAt?: number
}

export interface ItemData {
  name: string
}

let CURRENT_ID: number = 1

@routableApi({
  pathPrefix: "/test",
})
export class TestService {
  private items: Map<number, TestItem> = new Map()

  @route({
    template: "/items",
    method: HttpMethod.POST,
    mapping: <ItemData>(
      _parameters: Optional<RoutingParameters>,
      body?: ItemData,
    ) => {
      return [body]
    },
    format: SerializationFormat.JSON,
  })
  createItem(create: ItemData): ServiceResponse<TestItem> {
    if (create === undefined) {
      return { code: 400, message: "Missing body" }
    }

    const item: TestItem = {
      id: CURRENT_ID++,
      createdAt: Date.now(),
      name: create.name,
    }
    this.items.set(item.id, item)

    return item
  }

  @route({
    template: "/items/:itemId",
    method: HttpMethod.GET,
    mapping: (parameters: Optional<RoutingParameters>, _?: unknown) => {
      TEST_LOGGER.info(`mapping parameters: ${getDebugInfo(parameters)}`)
      return [parameters?.get("itemId")]
    },
  })
  getItem(itemId: number): Optional<TestItem> {
    TEST_LOGGER.info(`Received itemId: ${itemId}`)
    return this.items.get(itemId)
  }

  @route({
    template: "/items/:itemId",
    method: HttpMethod.PATCH,
    mapping: <ItemData>(
      parameters: Optional<RoutingParameters>,
      body?: ItemData,
    ) => {
      return [parameters?.get("itemId"), body]
    },
  })
  updateItem(itemId: number, update: ItemData): ServiceResponse<TestItem> {
    if (update === undefined) {
      return { code: 400, message: "Missing body" }
    }

    const item = this.items.get(itemId)
    if (item) {
      item.name = update.name
      return item
    }

    return { code: 404, message: "Item does not exist" }
  }
}
