import { hostFolder } from "@telefrek/http/hosting";
import { createDefaultPipelineBuilder } from "@telefrek/http/pipeline";
import { getDefaultBuilder } from "@telefrek/http/server";
import fs from "fs";

const server = getDefaultBuilder()
  .withTls({
    key: fs.readFileSync("./utils/server.key", "utf-8"),
    cert: fs.readFileSync("./utils/server.crt", "utf-8"),
  })
  .build();

const pipeline = createDefaultPipelineBuilder(server)
  .addTransform(hostFolder("../petstore-ui/build"))
  .build();

pipeline.on("error", (err) => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(`Error: ${err}`);
});

pipeline.on("finished", () => {
  console.log("pipeline has finished");
});

process.on("SIGINT", () => {
  console.log("received SIGINT, closing");
  void server.close();
});

// Wait for the end...
void server.listen(3000);
