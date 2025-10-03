import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
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
  tsconfig: "./tsconfig.json", // Explicitly use tsconfig.json
});
