import { sdk } from "./opentelemetrySetup"

export default () => {
  sdk.shutdown()
}
