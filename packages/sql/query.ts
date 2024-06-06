/**
 * Queries that are bound to SQL syntax and can be applied to a source
 */

export interface Query<
  QueryString extends string = string,
  ReturnType extends object = object,
> {
  queryString: QueryString

  execute(): Promise<ReturnType[]>
}
