/**
 * Helpers for tracking async context across some boundaries in the framework
 * (task queues, etc.)
 */

import type { AnyArgs, Func, MaybeAwaitableAny } from "./type/utils.js"

/**
 * Helper that allows tracking context
 */
export interface ContextTracker {
  /** The name of the context being tracked */
  readonly name: string

  /**
   * Allows wrapping the target to keep context tracking intact
   *
   * @param target The target to wrap
   */
  wrap(
    target: Func<AnyArgs, MaybeAwaitableAny>,
  ): Func<AnyArgs, MaybeAwaitableAny>
}

const TRACKERS: ContextTracker[] = []

/**
 * Register the {@link ContextTracker} for tracking future calls
 *
 * @param tracker The {@link ContextTracker} to add
 */
export function registerContextTracker(tracker: ContextTracker): void {
  TRACKERS.push(tracker)
}

/**
 * Deregister the {@link ContextTracker} so it is not used in the future
 *
 * @param tracker The {@link ContextTracker} to remove
 */
export function deregisterContextTracker(tracker: ContextTracker): void {
  let idx = -1
  while ((idx = TRACKERS.indexOf(tracker))) {
    TRACKERS.splice(idx)
  }
}

/**
 * Adds the registered {@link ContextTracker} to the target
 *
 * @param target The target to track
 * @returns A wrapped version for registerred {@link ContextTracker}
 */
export function track(
  target: Func<AnyArgs, MaybeAwaitableAny>,
): Func<AnyArgs, MaybeAwaitableAny> {
  // Wrap all the targets
  for (const tracker of TRACKERS) {
    target = tracker.wrap(target)
  }

  return target
}
