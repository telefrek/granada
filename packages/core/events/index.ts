/**
 * Helper interface for defining structured events that will be emitted
 */
export interface Emitter<E> {

    /**
     * Match all EventEmitter.on functionality
     *
     * @param event The event that was raised
     * @param listener The listener to add
     */
    on<T extends keyof E>(
        event: T,
        listener: E[T]
    ): this

    /**
     * Match all EventEmitter.on functionality
     *
     * @param event The event that was raised
     * @param listener The listener to add to the next invocation only
     */
    once<T extends keyof E>(
        event: T,
        listener: E[T]
    ): this

    /**
     * Match all EventEmitter.off functionality
     *
     * @param event The event that was raised
     * @param listener The listener to remove
     */
    off<T extends keyof E>(
        event: T,
        listener: E[T]
    ): this

    /**
     * Match all EventEmitter.emit functionality
     *
     * @param event The event that was raised
     * @param args  The parameters for the function to invoke
     */
    emit<T extends keyof E>(
        event: T,
        ...args: Parameters<E[T]>
    ): boolean
}