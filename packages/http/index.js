"use strict";
/**
 * Core package definitions and interfaces
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePath = exports.isFileContent = exports.HttpStatus = exports.HttpRequestState = exports.emptyHeaders = exports.HttpVersion = exports.HTTP_METHODS = exports.HttpMethod = void 0;
/**
 * Supported methods for HTTP operations
 */
var HttpMethod;
(function (HttpMethod) {
    HttpMethod["GET"] = "GET";
    HttpMethod["PUT"] = "PUT";
    HttpMethod["POST"] = "POST";
    HttpMethod["PATCH"] = "PATCH";
    HttpMethod["DELETE"] = "DELETE";
    HttpMethod["OPTIONS"] = "OPTIONS";
})(HttpMethod || (exports.HttpMethod = HttpMethod = {}));
/**
 * Valid {@link HttpMethod} values as an array
 */
exports.HTTP_METHODS = [
    HttpMethod.GET,
    HttpMethod.PUT,
    HttpMethod.POST,
    HttpMethod.PATCH,
    HttpMethod.DELETE,
    HttpMethod.OPTIONS,
];
/**
 * Supported HTTP Versions
 */
var HttpVersion;
(function (HttpVersion) {
    HttpVersion["HTTP1_1"] = "HTTP1.1";
    HttpVersion["HTTP_2"] = "HTTP2";
})(HttpVersion || (exports.HttpVersion = HttpVersion = {}));
/**
 * Create an empty set of {@link HttpHeaders}
 * @returns An empty set of {@link HttpHeaders}
 */
function emptyHeaders() {
    return new Map();
}
exports.emptyHeaders = emptyHeaders;
/**
 * Set of states that a {@link HttpRequest} can be in
 */
var HttpRequestState;
(function (HttpRequestState) {
    /** The request is waiting to be processed */
    HttpRequestState["PENDING"] = "pending";
    /** The request is being read but not processed via handler */
    HttpRequestState["READING"] = "reading";
    /** The request is being processed via a handler */
    HttpRequestState["PROCESSING"] = "processing";
    /** The request has response data being written to it */
    HttpRequestState["WRITING"] = "writing";
    /**  The request was fully written and completed */
    HttpRequestState["COMPLETED"] = "completed";
    /** The request timed out before being handled */
    HttpRequestState["TIMEOUT"] = "timeout";
    /** The request encountered some error */
    HttpRequestState["ERROR"] = "error";
})(HttpRequestState || (exports.HttpRequestState = HttpRequestState = {}));
/**
 * Set of status codes with names
 */
var HttpStatus;
(function (HttpStatus) {
    HttpStatus[HttpStatus["CONTINUE"] = 100] = "CONTINUE";
    HttpStatus[HttpStatus["SWITCH_PROTOCOLS"] = 101] = "SWITCH_PROTOCOLS";
    HttpStatus[HttpStatus["PROCESSING"] = 102] = "PROCESSING";
    HttpStatus[HttpStatus["EARLY_HINTS"] = 103] = "EARLY_HINTS";
    HttpStatus[HttpStatus["OK"] = 200] = "OK";
    HttpStatus[HttpStatus["CREATED"] = 201] = "CREATED";
    HttpStatus[HttpStatus["ACCEPTED"] = 202] = "ACCEPTED";
    HttpStatus[HttpStatus["NON_AUTHORITIVE_INFORMATION"] = 203] = "NON_AUTHORITIVE_INFORMATION";
    HttpStatus[HttpStatus["NO_CONTENT"] = 204] = "NO_CONTENT";
    HttpStatus[HttpStatus["RESET_CONTENT"] = 205] = "RESET_CONTENT";
    HttpStatus[HttpStatus["PARTIAL_CONTENT"] = 206] = "PARTIAL_CONTENT";
    HttpStatus[HttpStatus["MULTI_STATUS"] = 207] = "MULTI_STATUS";
    HttpStatus[HttpStatus["ALREADY_REPORTED"] = 208] = "ALREADY_REPORTED";
    HttpStatus[HttpStatus["IM_USED"] = 226] = "IM_USED";
    HttpStatus[HttpStatus["MULTIPLE_CHOICES"] = 300] = "MULTIPLE_CHOICES";
    HttpStatus[HttpStatus["MOVED_PERMANENTLY"] = 301] = "MOVED_PERMANENTLY";
    HttpStatus[HttpStatus["FOUND"] = 302] = "FOUND";
    HttpStatus[HttpStatus["SEE_OTHER"] = 303] = "SEE_OTHER";
    HttpStatus[HttpStatus["NOT_MODIFIED"] = 304] = "NOT_MODIFIED";
    HttpStatus[HttpStatus["USE_PROXY"] = 305] = "USE_PROXY";
    HttpStatus[HttpStatus["SWITCH_PROXY"] = 306] = "SWITCH_PROXY";
    HttpStatus[HttpStatus["TEMPORARY_REDIRECT"] = 307] = "TEMPORARY_REDIRECT";
    HttpStatus[HttpStatus["PERMANENT_REDIRECT"] = 308] = "PERMANENT_REDIRECT";
    HttpStatus[HttpStatus["BAD_REQUEST"] = 400] = "BAD_REQUEST";
    HttpStatus[HttpStatus["UNAUTHORIZED"] = 401] = "UNAUTHORIZED";
    HttpStatus[HttpStatus["PAYMENT_REQUIRED"] = 402] = "PAYMENT_REQUIRED";
    HttpStatus[HttpStatus["FORBIDDEN"] = 403] = "FORBIDDEN";
    HttpStatus[HttpStatus["NOT_FOUND"] = 404] = "NOT_FOUND";
    HttpStatus[HttpStatus["METHOD_NOT_ALLOWED"] = 405] = "METHOD_NOT_ALLOWED";
    HttpStatus[HttpStatus["NOT_ACCEPTABLE"] = 406] = "NOT_ACCEPTABLE";
    HttpStatus[HttpStatus["PROXY_AUTHENTICATION_REQUIRED"] = 407] = "PROXY_AUTHENTICATION_REQUIRED";
    HttpStatus[HttpStatus["REQUEST_TIMEOUT"] = 408] = "REQUEST_TIMEOUT";
    HttpStatus[HttpStatus["CONFLICT"] = 409] = "CONFLICT";
    HttpStatus[HttpStatus["GONE"] = 410] = "GONE";
    HttpStatus[HttpStatus["LENGTH_REQUIRED"] = 411] = "LENGTH_REQUIRED";
    HttpStatus[HttpStatus["PRECONDITION_FAILED"] = 412] = "PRECONDITION_FAILED";
    HttpStatus[HttpStatus["PAYLOAD_TOO_LARGE"] = 413] = "PAYLOAD_TOO_LARGE";
    HttpStatus[HttpStatus["URI_TOO_LONG"] = 414] = "URI_TOO_LONG";
    HttpStatus[HttpStatus["UNSUPPORTED_MEDIA_TYPE"] = 415] = "UNSUPPORTED_MEDIA_TYPE";
    HttpStatus[HttpStatus["RANGE_NOT_SATISFIABLE"] = 416] = "RANGE_NOT_SATISFIABLE";
    HttpStatus[HttpStatus["EXPECTATION_FAILED"] = 417] = "EXPECTATION_FAILED";
    HttpStatus[HttpStatus["TEAPOT"] = 418] = "TEAPOT";
    HttpStatus[HttpStatus["MISDIRECTED_REQUEST"] = 421] = "MISDIRECTED_REQUEST";
    HttpStatus[HttpStatus["UNPROCESSABLE_ENTITY"] = 422] = "UNPROCESSABLE_ENTITY";
    HttpStatus[HttpStatus["LOCKED"] = 423] = "LOCKED";
    HttpStatus[HttpStatus["FAILED_DEPENDENCY"] = 424] = "FAILED_DEPENDENCY";
    HttpStatus[HttpStatus["TOO_EARLY"] = 425] = "TOO_EARLY";
    HttpStatus[HttpStatus["UPGRADE_REQUIRED"] = 426] = "UPGRADE_REQUIRED";
    HttpStatus[HttpStatus["PRECONDITION_REQUIRED"] = 428] = "PRECONDITION_REQUIRED";
    HttpStatus[HttpStatus["TOO_MANY_REQUESTS"] = 429] = "TOO_MANY_REQUESTS";
    HttpStatus[HttpStatus["REQUEST_HEADER_FIELDS_TOO_LARGE"] = 431] = "REQUEST_HEADER_FIELDS_TOO_LARGE";
    HttpStatus[HttpStatus["UNAVAILABLE_FOR_LEGAL_REASONS"] = 451] = "UNAVAILABLE_FOR_LEGAL_REASONS";
    HttpStatus[HttpStatus["INTERNAL_SERVER_ERROR"] = 500] = "INTERNAL_SERVER_ERROR";
    HttpStatus[HttpStatus["NOT_IMPLEMENTED"] = 501] = "NOT_IMPLEMENTED";
    HttpStatus[HttpStatus["BAD_GATEWAY"] = 502] = "BAD_GATEWAY";
    HttpStatus[HttpStatus["SERVICE_UNAVAILABLE"] = 503] = "SERVICE_UNAVAILABLE";
    HttpStatus[HttpStatus["GATEWAY_TIMEOUT"] = 504] = "GATEWAY_TIMEOUT";
    HttpStatus[HttpStatus["HTTP_VERSION_NOT_SUPPORTED"] = 505] = "HTTP_VERSION_NOT_SUPPORTED";
    HttpStatus[HttpStatus["VARIANT_ALSO_NEGOTIATES"] = 506] = "VARIANT_ALSO_NEGOTIATES";
    HttpStatus[HttpStatus["INSUFFICIENT_STORAGE"] = 507] = "INSUFFICIENT_STORAGE";
    HttpStatus[HttpStatus["LOOP_DETECTED"] = 508] = "LOOP_DETECTED";
    HttpStatus[HttpStatus["NOT_EXTENDED"] = 510] = "NOT_EXTENDED";
    HttpStatus[HttpStatus["NETWORK_AUTHENTICATION_REQUIRED"] = 511] = "NETWORK_AUTHENTICATION_REQUIRED";
})(HttpStatus || (exports.HttpStatus = HttpStatus = {}));
/**
 * Utility method to check for {@link FileContentResponse} objects
 *
 * @param response A {@link HttpResponse} to inspect
 * @returns True if the response is a {@link FileContentResponse}
 */
function isFileContent(response) {
    return (response !== undefined &&
        "filePath" in response &&
        typeof response.filePath === "string");
}
exports.isFileContent = isFileContent;
/**
 * Parse the path string into it's corresponding {@link HttpPath} and {@link HttpQuery}
 *
 * @param path The path to parse
 * @returns A {@link HttpPath} and {@link HttpQuery} representing the path
 */
function parsePath(path) {
    // Remove any URI encoding
    const uri = decodeURI(path).split("?");
    // Parse out the path and the query, removing leading and trailing '/' characters
    return {
        path: {
            original: uri[0],
            segments: uri[0].replace(/^\//, "").replace(/\/$/, "").split("/"),
            parameters: new Map(),
        },
        query: uri.length > 1
            ? {
                original: uri[1],
                parameters: uri[1].split("&").reduce((map, segment) => {
                    const kv = segment.split("=");
                    if (kv.length === 2) {
                        if (map.has(kv[0])) {
                            if (Array.isArray(map.get(kv[0]))) {
                                ;
                                map.get(kv[0]).push(kv[1]);
                            }
                            else {
                                map.set(kv[0], [map.get(kv[0]), kv[1]]);
                            }
                        }
                        else {
                            map.set(kv[0], kv[1]);
                        }
                    }
                    return map;
                }, new Map()),
            }
            : undefined,
    };
}
exports.parsePath = parsePath;
