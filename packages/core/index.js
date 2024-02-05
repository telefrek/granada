"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmpty = void 0;
/**
 * Checks if th eobject is empty
 * @param target The object to inspect
 * @returns true if the object has no properties
 */
function isEmpty(target) {
    // Only works with objects
    if (typeof target === "object" && target !== null) {
        for (const _ in target) {
            return false;
        }
        return true;
    }
    return false;
}
exports.isEmpty = isEmpty;
