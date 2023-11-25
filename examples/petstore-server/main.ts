import { HttpStatus, emptyHeaders } from "@telefrek/http";
import { parseMediaType } from "@telefrek/http/content";
import { getDefaultBuilder } from "@telefrek/http/server";
import fs from "fs";
import mime from "mime";
import path from "path";
import { Readable } from "stream";

const server = getDefaultBuilder()
  .withTls({
    key: fs.readFileSync("./utils/server.key", "utf-8"),
    cert: fs.readFileSync("./utils/server.crt", "utf-8"),
  })
  .build();

server.on("listening", (port: number) => console.log(`listening on ${port}`));
server.on("stopping", () => console.log("stopping"));
server.on("finished", () => console.log("finished"));

server.on("request", (request) => {
  if (request.path.original.startsWith("/api")) {
    request.respond({
      status: HttpStatus.OK,
      headers: emptyHeaders(),
      body: {
        contents: Readable.from("Hello World"),
        mediaType: {
          type: "text",
          subType: "plain",
          parameters: new Map([["encoding", "utf-8"]]),
        },
      },
    });
  } else {
    const fileName =
      request.path.original === "/" ? "index.html" : request.path.original;

    request.respond({
      status: HttpStatus.OK,
      headers: emptyHeaders(),
      body: {
        contents: fs.createReadStream(
          path.join("../petstore-ui/build", fileName),
          "utf-8"
        ),
        mediaType: parseMediaType(
          mime.lookup(path.join("../petstore-ui/build", fileName))
        )!,
      },
    });
  }
});

process.on("SIGINT", () => {
  console.log("received SIGINT, closing");
  void server.close();
});

// Wait for the end...
void server.listen(3000);
