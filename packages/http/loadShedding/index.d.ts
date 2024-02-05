/**
 * Package for managing load shedding within an application
 */
import { Limiter } from "@telefrek/core/concurrency/limits";
import { HttpPipelineTransform } from "../pipeline";
export declare function enableLoadShedding(thresholdMs?: number, limiter?: Limiter | undefined): HttpPipelineTransform;
