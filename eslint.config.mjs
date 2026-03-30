import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.ts"],
    plugins: {
      obsidianmd
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json"
      },
      globals: {
        navigator: "readonly"
      }
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }]
    }
  }
]);
