/**
 * Package for handling media type operations
 */
import { MediaType } from ".";
/**
 * Attempts to map the file extension to a {@link MediaType}
 *
 * @param filename The file to extract a {@link MediaType} for
 * @returns The {@link MediaType} or undefined for the filename
 */
export declare const fileToMediaType: (filename: string) => Promise<MediaType | undefined>;
