/**
 * Common components used by this package
 */

/**
 * The target platform the service will be running on for optimizing some operations
 */
export enum HostingPlatform {
  BARE_METAL,
  ECS,
  LAMBDA,
  KUBERNETES,
}

export enum SerializationFormat {
  JSON,
}

export interface Endpoint {
  format: SerializationFormat
  pathTemplate: string
}

export interface Service {
  pathPrefix?: string
  endpoints: Endpoint[]
}
