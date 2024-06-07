/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Queries that are bound to SQL syntax and can be applied to a source
 */

import type { NormalizeQuery } from "./parser.js"
import type { SQLDatabaseSchema } from "./schema.js"
import type { ValidateQueryString } from "./validation.js"

export function createBuilder<S extends SQLDatabaseSchema<any, any>>() {
  return <T extends string, P extends unknown[] = []>(
    q: ValidateQueryString<S, T>,
  ): Query<NormalizeQuery<T>, object, P> => {
    return {
      queryString: q as any,
      execute(..._args: P) {
        throw new Error("not implemented")
      },
    }
  }
}

export interface Query<
  QueryString extends string = string,
  ReturnType extends object = object,
  Parameters extends unknown[] = never,
> {
  queryString: QueryString

  execute(...args: Parameters): Promise<ReturnType[]>
}
