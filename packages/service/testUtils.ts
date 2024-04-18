/**
 * Service definition and tooling for tests
 */

import type { Optional } from "@telefrek/core/type/utils"
import { HttpMethod, type SegmentValue } from "@telefrek/http/index.js"
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
      parameters: Map<string, SegmentValue>,
      body?: ItemData,
    ) => {
      return [body]
    },
    format: SerializationFormat.JSON,
  })
  createItem(create: ItemData): ServiceResponse<TestItem> {
    if (create === undefined) {
      return { status: 400, statusMessage: "Missing body" }
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
    mapping: (parameters: Map<string, SegmentValue>, _?: unknown) => {
      return [parameters.get("itemId")]
    },
  })
  getItem(itemId: number): Optional<TestItem> {
    return this.items.get(itemId)
  }

  @route({
    template: "/items/:itemId",
    method: HttpMethod.PATCH,
    mapping: <ItemData>(
      parameters: Map<string, SegmentValue>,
      body?: ItemData,
    ) => {
      return [parameters.get("itemId"), body]
    },
  })
  updateItem(itemId: number, update: ItemData): ServiceResponse<TestItem> {
    if (update === undefined) {
      return { status: 400, statusMessage: "Missing body" }
    }

    const item = this.items.get(itemId)
    if (item) {
      item.name = update.name
      return item
    }

    return { status: 404, statusMessage: "Item does not exist" }
  }
}
