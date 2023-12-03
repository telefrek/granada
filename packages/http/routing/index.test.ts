import { EventEmitter } from "stream";
import {
  HttpBody,
  HttpHandler,
  HttpHeaders,
  HttpMethod,
  HttpPath,
  HttpQuery,
  HttpRequest,
  HttpResponse,
  HttpVersion,
  emptyHeaders,
  parsePath,
} from "..";
import { createRouter } from "./index";

class TestRequest extends EventEmitter implements HttpRequest {
  path: HttpPath;
  method: HttpMethod;
  headers: HttpHeaders = emptyHeaders();
  version: HttpVersion;
  query?: HttpQuery | undefined;
  body?: HttpBody | undefined;
  respond(response: HttpResponse): void {
    this.emit("response", response);
  }

  constructor(args: {
    path: HttpPath;
    query?: HttpQuery;
    method?: HttpMethod;
    version?: HttpVersion;
  }) {
    super();
    this.path = args.path;
    this.query = args.query;
    this.method = args.method ?? HttpMethod.GET;
    this.version = args.version ?? HttpVersion.HTTP1_1;
  }
}

function request(
  path: string,
  method: HttpMethod = HttpMethod.GET
): HttpRequest {
  return new TestRequest({
    ...parsePath(path),
    method: method,
  });
}

describe("verify router", () => {
  test("A router should not accept invalid templates", () => {
    const router = createRouter();
    const handler: HttpHandler = (_request) => Promise.reject("invalid");

    expect(() => router.register("/", handler)).toThrowError();
    expect(() => router.register("/...", handler)).toThrowError();
    expect(() => router.register("/{parameter", handler)).toThrowError();
    expect(() => router.register("/{{parameter}}", handler)).toThrowError();
    expect(() => router.register("/invlid{parameter}", handler)).toThrowError();
    expect(() => router.register("/ /is/not/valid", handler)).toThrowError();
    expect(() =>
      router.register("/cannot/**/terminate", handler)
    ).toThrowError();
    expect(() => router.register("/*t", handler)).toThrowError();
    expect(() => router.register("/t*", handler)).toThrowError();

    router.register("/one/{two}/three", handler);
    expect(() => router.register("/one/*/three", handler)).toThrowError();
  });

  test("A router should accept valid templates", () => {
    const router = createRouter();
    const handler: HttpHandler = (_request) => Promise.reject("invalid");

    router.register("/valid", handler);
    router.register("/this/is/a/valid/handler/", handler);
    router.register("/{parameter}/should/work", handler);
    router.register("/{multiple}/parameters/{should}/work", handler);
    router.register("/terminal/**", handler);
    router.register("/wildcards/*/should/be/{accepted}/**", handler);

    expect(router.lookup(request("/valid"))).not.toBeUndefined();
  });

  test("A router should accept a top level terminal", () => {
    const router = createRouter();
    const handler: HttpHandler = (_request) => Promise.reject("invalid");

    router.register("/**", handler);

    expect(router.lookup(request("/foo"))).not.toBeUndefined();
    expect(router.lookup(request("/foo/bar"))).not.toBeUndefined();
    expect(router.lookup(request("/foo/bar/baz"))).not.toBeUndefined();
  });

  test("A router should accept a top level wildcard", () => {
    const router = createRouter();
    const handler: HttpHandler = (_request) => Promise.reject("invalid");

    router.register("/*", handler);

    expect(router.lookup(request("/bar/baz"))).toBeUndefined();
    expect(router.lookup(request("/bar"))).not.toBeUndefined();
  });
});
