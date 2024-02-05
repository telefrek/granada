"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineTransforms = exports.createTransform = exports.GenericTransform = void 0;
const stream_1 = require("stream");
/**
 * Create a generic {@link Stream.Transform} using a {@link TransformFunc}
 */
class GenericTransform extends stream_1.Stream.Transform {
    #transform;
    constructor(transform) {
        super({ objectMode: true });
        this.#transform = transform;
    }
    /**
     * Implements the {@link Stream.Transform} with typed values
     *
     * @param chunk The chunk of data to transform
     * @param _encoding Ignored since we are always in object mode
     * @param callback The callback to fire on completion
     */
    async _transform(chunk, _encoding, callback) {
        try {
            const val = await this.#transform(chunk);
            if (val !== undefined)
                this.push(val);
            callback();
        }
        catch (err) {
            callback(err, chunk);
        }
    }
}
exports.GenericTransform = GenericTransform;
/**
 * Creates a {@link GenericTransform} from a given {@link TransformFunc}
 *
 * @param transform The {@link TransformFunc} to use
 * @returns A {@link GenericTransform}
 */
const createTransform = (transform) => new GenericTransform(transform);
exports.createTransform = createTransform;
/**
 * Combines two {@link TransformFunc} into a single {@link TransformFunc}
 *
 * @param left The left {@link TransformFunc} to use
 * @param right The right {@link TransformFunc} to use
 * @returns a new {@link TransformFunc} that combines the left and right sides
 */
const combineTransforms = (left, right) => {
    return async (data) => {
        const intermediate = await left(data);
        return intermediate ? await right(intermediate) : undefined;
    };
};
exports.combineTransforms = combineTransforms;
