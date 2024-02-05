/**
 * Expose the ability to host a folder on a given path
 */
import { HttpPipelineTransform } from "../pipeline";
/**
 * Create a {@link HttpPipelineTransform} for hosting a folder
 *
 * @param baseDir The directory to host
 * @param defaultFile The file to send if requesting `/` (default is `index.html`)
 * @returns A new {@link HttpPipelineTransform}
 */
export declare function hostFolder(baseDir: string, defaultFile?: string): HttpPipelineTransform;
