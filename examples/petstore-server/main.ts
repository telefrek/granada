import { hostFolder } from "@telefrek/http/hosting"
import { createPipeline } from "@telefrek/http/pipeline"
import { getDefaultBuilder } from "@telefrek/http/server"
import fs from "fs"
import path from "path"

const dir = path.dirname(__filename)

const server = getDefaultBuilder()
  .withTls({
    key: fs.readFileSync(path.join(dir, "./utils/server.key"), "utf-8"),
    cert: fs.readFileSync(path.join(dir, "./utils/server.crt"), "utf-8"),
  })
  .build()

const pipeline = createPipeline(server, {
  routing: hostFolder(path.join(dir, "../petstore-ui/build")),
})

pipeline.on("error", (err) => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(`Error: ${err}`)
})

pipeline.on("finished", () => {
  console.log("pipeline has finished")
})

process.on("SIGINT", () => {
  console.log("received SIGINT, closing")
  void server.close()
})

// Wait for the end...
void server.listen(3000)
