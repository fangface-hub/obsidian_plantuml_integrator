import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "child_process"],
  format: "cjs",
  platform: "node",
  target: "es2020",
  outfile: "main.js",
  sourcemap: watch ? "inline" : false,
  logLevel: "info"
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
