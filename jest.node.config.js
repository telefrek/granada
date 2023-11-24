module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageDirectory: "coverage",
  testMatch: ["<rootDir>/**/*.test.ts"],
  collectCoverageFrom: ["packages/**/*.{ts,js,jsx}"],
  coveragePathIgnorePatterns: ["jest.*.config.js", "/node_modules/", "/dist/"],
  moduleNameMapper: {
    "^@telefrek/(.*)$": "<rootDir>/packages/$1/",
  },
};
