import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import solid from "eslint-plugin-solid";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["dist/**", "node_modules/**", ".wrangler/**", "coverage/**", "playwright-report/**", "test-results/**", "docs/design/reference/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { solid },
    rules: solid.configs.typescript.rules,
  },
]);
