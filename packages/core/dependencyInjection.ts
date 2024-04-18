/**
 * Simple DI framework that is optional to use
 */

import type { Optional } from "./type/utils.js"

type ValueProvider<T> = () => T

export interface Container {
  register<T>(identifier: string, provider: ValueProvider<T>): boolean
  deregister(identifier: string): boolean

  resolve(identifier: string): Optional<unknown>
}

export class DefaultContainer implements Container {
  private readonly _providers: Map<string, ValueProvider<unknown>> = new Map()

  register<T>(identifier: string, provider: ValueProvider<T>): boolean {
    if (!this._providers.has(identifier)) {
      this._providers.set(identifier, provider)
      return true
    }

    return false
  }

  deregister(identifier: string): boolean {
    return this._providers.delete(identifier)
  }

  resolve(identifier: string): Optional<unknown> {
    const provider = this._providers.get(identifier)
    return provider ? provider() : undefined
  }
}

export function setGlobalContainer(container: Container) {
  GLOBAL_CONTAINER = container
}

export function getGlobalContainer(): Container {
  return GLOBAL_CONTAINER
}

export interface RegistrationOptions {
  singleton?: boolean
}

export function createDIContext(container: Container = GLOBAL_CONTAINER): {
  injectable: ConstructorDecorator
  register: (
    idenfifier: string,
    options?: RegistrationOptions,
  ) => ConstructorDecorator
} {
  return {
    injectable: (ctor) => _injectable(ctor, container),
    register: (identifier, options) =>
      _register(container, identifier, options),
  }
}

export function inject(identifier: string): FieldDecorator {
  return function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    propertyKey: string,
  ) {
    // Check if prototype
    if (typeof target === "object" && target) {
      let metadata: Optional<InjectableFieldMetadata> =
        target[INJECTABLE_FIELDS]
      if (metadata === undefined) {
        target[INJECTABLE_FIELDS] = metadata = new Map<string, string>()
      }

      metadata.set(propertyKey, identifier)
    }
  }
}

type ConstructorDecorator = <T extends ConstructorTarget>(ctor: T) => T

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FieldDecorator = (target: any, propertyKey: string) => void

const INJECTABLE_FIELDS: unique symbol = Symbol()
const MODIFIED_CTOR: unique symbol = Symbol()

type InjectableFieldMetadata = Map<string, string>

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
type ConstructorTarget = { new (...args: any[]): {} }

let GLOBAL_CONTAINER: Container = new DefaultContainer()

function _register(
  container: Container,
  identifier: string,
  options?: RegistrationOptions,
): ConstructorDecorator {
  return function <T extends ConstructorTarget>(ctor: T): T {
    const proto = ctor.prototype

    let provider: ValueProvider<T> = () => new (proto[MODIFIED_CTOR] ?? ctor)()

    if (options?.singleton) {
      let singleton: Optional<T>
      provider = () => {
        if (singleton === undefined) {
          singleton = new (proto[MODIFIED_CTOR] ?? ctor)()
        }

        return singleton!
      }
    }

    container.register(identifier, provider)

    return ctor
  }
}

/**
 * Implement the decorator for the actual injection using the specified container
 *
 * @param ctor The class constructor
 * @param container The {@link Container} to use for injection
 * @returns A decorated class that resolves using the container
 */
function _injectable<T extends ConstructorTarget>(
  ctor: T,
  container: Container,
): T {
  // Load the prototype
  const proto = ctor.prototype

  if (proto[INJECTABLE_FIELDS] === undefined) {
    return ctor
  }

  const injectableData = proto[INJECTABLE_FIELDS] as InjectableFieldMetadata

  const modified = class extends ctor {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      super(...args)

      for (const key of injectableData.keys()) {
        Object.defineProperty(this, key, {
          value: container.resolve(injectableData.get(key)!),
        })
      }
    }
  }

  // Set the modified constructor so order between inject and register doesn't matter
  proto[MODIFIED_CTOR] = modified

  return modified
}
