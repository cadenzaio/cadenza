import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    external: ["typescript"],
    dts: {
      entry: "src/index.ts",
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
    },
    sourcemap: true,
    clean: true,
    outDir: "dist",
    tsconfig: "./tsconfig.json",
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    external: ["typescript"],
    dts: false,
    sourcemap: true,
    clean: false,
    outDir: "dist",
    tsconfig: "./tsconfig.json",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
