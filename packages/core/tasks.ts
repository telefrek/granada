import type { Duration } from "./time.js"

export interface TaskCompletionEvents {
  completed: (duration: Duration, success: boolean) => void
}
