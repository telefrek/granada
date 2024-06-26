/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageDirectory: "coverage",
  testMatch: ["<rootDir>/**/*.test.ts"],
  collectCoverageFrom: [
    "packages/**/*.{ts,js,jsx}",
    "!packages/**/testUtils.ts",
  ],
  coveragePathIgnorePatterns: [
    "eslint.config.js",
    "jest.*.config.js",
    "/node_modules",
    "/dist",
  ],
  moduleNameMapper: {
    "^@telefrek/(.*)\\.js$": "<rootDir>/packages/$1/",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
}
