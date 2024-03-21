module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageDirectory: "coverage",
  testMatch: ["<rootDir>/**/*.{test,integration}.ts"],
  collectCoverageFrom: ["packages/**/*.{ts,js,jsx}"],
  coveragePathIgnorePatterns: [
    "jest.*.config.js",
    "/node_modules",
    "/dist",
    "packages/http/content/media.ts",
  ],
  moduleNameMapper: {
    "^@telefrek/(.*)$": "<rootDir>/packages/$1/",
  },
}
