import {
  DefaultContainer,
  createDIContext,
  getGlobalContainer,
  inject,
  setGlobalContainer,
} from "./dependencyInjection.js"

const container = new DefaultContainer()
setGlobalContainer(container)
container.register("foo", () => "Injected")

const { injectable, register } = createDIContext(getGlobalContainer())

describe("Dependency injection should allow manipulation of objects", () => {
  it("should be able to manipulate a class", () => {
    @injectable
    @register("t123", { singleton: true })
    class Target {
      @inject("foo") name?: string
      id: number = Math.random()
    }

    @injectable
    class Bar {
      @inject("t123") target?: Target
    }

    // Create our object
    const target = new Target()
    expect(target).not.toBeUndefined()

    // Verify our injection
    expect(target.name).toEqual("Injected")

    // Verify the type is preserved
    expect(target instanceof Target).toBeTruthy()

    const bar1 = new Bar()
    expect(bar1.target).not.toBeUndefined()
    expect(bar1.target?.name).toEqual("Injected")

    const bar2 = new Bar()
    expect(bar2.target).not.toBeUndefined()
    expect(bar2.target?.name).toEqual("Injected")
    expect(bar1.target?.id).toEqual(bar2.target?.id)
    expect(bar1.target?.id).not.toEqual(target.id)
  })
})
