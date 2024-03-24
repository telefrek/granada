const typeScriptEsLintPlugin = require("@typescript-eslint/eslint-plugin")
const esLintConfigPrettier = require("eslint-config-prettier")
const { FlatCompat } = require("@eslint/eslintrc")

// Translate ESLintRC-style configs into flat configs.
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: typeScriptEsLintPlugin.configs["recommended"],
})

module.exports = [
  // ESLint recommended flat config.
  "eslint:recommended",

  // Flat config for parsing TypeScript files. Includes rules for TypeScript.
  ...compat.config({
    env: { node: true },
    extends: ["plugin:@typescript-eslint/recommended"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: ["@typescript-eslint"],
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-empty-interface": "error",
    },
  }),

  // Flat config for turning off all rules that are unnecessary or might conflict with Prettier.
  esLintConfigPrettier,

  // Flat config for ESLint rules.
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-warning-comments": 1,
    },
  },
  {
    ignores: ["eslint.config.js", "**/dist/*"],
  },
]
