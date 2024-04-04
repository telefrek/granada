module.exports = {
  testEnvironment: "node",
  coverageDirectory: "coverage",
  testMatch: ["<rootDir>/**/*.{test,integration}.ts"],
  collectCoverageFrom: [
    "packages/**/*.{ts,js,jsx}",
    "!packages/**/testUtils.ts",
  ],
  transform: {
    "^.+\\.(js|ts)$": "babel-jest",
  },
  coveragePathIgnorePatterns: [
    "eslint.config.js",
    "jest.*.config.js",
    "/node_modules",
    "/dist",
    "packages/http/content/media.ts",
  ],
  moduleNameMapper: {
    "^@telefrek/(.*)$": "<rootDir>/packages/$1/",
  },
}
