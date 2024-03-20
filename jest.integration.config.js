var config = require("./jest.config")
;(config.testMatch = ["<rootDir>/**/*.integration.ts"]),
  console.log("RUNNING INTEGRATION TESTS")
module.exports = config
