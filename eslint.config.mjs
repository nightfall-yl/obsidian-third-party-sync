import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    // Stub .js files and any non-TS code that is not part of the tsconfig include
    // (e.g. src/stubs/empty.js).  Typed rules from obsidianmd / typescript-eslint
    // cannot run here since there's no type information.
    files: ["src/stubs/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/no-plugin-as-component": "off",
      "obsidianmd/no-tfile-tfolder-cast": "off",
      "obsidianmd/no-unsupported-api": "off",
      // Stub files are CommonJS esbuild placeholders (e.g. module.exports),
      // so `module` is intentionally used despite the ESM lint environment.
      "no-undef": "off",
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow sample-names (we are a fork of Remotely Save, using our own naming)
      "obsidianmd/sample-names": "off",
      // Node.js builtins (buffer, process, path...) are intentionally imported and
      // polyfilled by esbuild + the browser field (buffer/process/etc), so the
      // no-nodejs-modules rule does not apply to this project.
      "import/no-nodejs-modules": "off",
    },
  },
  {
    // webdav's browser deep-import (dist/web/index.js) ships without type
    // declarations, so every call on it resolves to `any`. Suppress the
    // no-unsafe-* noise in the WebDAV client integration rather than fight the
    // third-party typing. The actual runtime behavior is unchanged.
    files: ["src/remoteForWebdav.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
]);
