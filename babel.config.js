module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    "@babel/preset-typescript",
  ],
  plugins: [
    "@babel/plugin-syntax-import-attributes",
    "@babel/plugin-proposal-explicit-resource-management",
  ],
  parserOpts: {
    plugins: ["importAttributes"],
  },
}
