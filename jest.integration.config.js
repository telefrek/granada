/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageDirectory: "coverage",
  testMatch: ["<rootDir>/**/*.integration.ts"],
  collectCoverageFrom: [
    "packages/**/*.{ts,js,jsx}",
    "!packages/**/testUtils.ts",
  ],
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
