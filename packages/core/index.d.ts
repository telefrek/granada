/** Simple type representing `void | PromiseLike<void>` */
export type MaybeAwaitable<T> = T | PromiseLike<T>;
/**
 * Checks if th eobject is empty
 * @param target The object to inspect
 * @returns true if the object has no properties
 */
export declare function isEmpty(target: unknown): boolean;
