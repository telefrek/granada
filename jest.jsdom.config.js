module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/**/*.test.tsx"],
  coverageDirectory: "coverage",
  collectCoverageFrom: ["<rootDir>/packages/*.{tsx,ts,jsx}"],
  coveragePathIgnorePatterns: ["jest.*.config.js", "/node_modules/", "/dist/"],
  moduleNameMapper: {
    "^@telefrek/(.*)$": "<rootDir>/packages/$1/",
  },
}
