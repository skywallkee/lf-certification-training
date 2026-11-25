/**
 * Bundles the Node entry points that the container images run (the lab controller and the database setup job)
 * into single ESM files with esbuild, so the runtime images need neither pnpm, tsx nor node_modules.
 *
 *   node scripts/bundle.mjs [outdir]        default outdir: dist/bundles
 *
 * The workspace packages find their data files (content/, drizzle migrations) relative to their own source file
 * through import.meta.url / import.meta.dirname. A bundle would point those at the bundle instead, so this script
 * pins them to each source file's original path; the image keeps content/ and the migration folders at the same
 * paths (WORKDIR /repo) and everything resolves exactly as it does with tsx.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.resolve(root, process.argv[2] ?? "dist/bundles");

/** Replaces import.meta.url/dirname/filename in workspace sources with that file's own path. */
const pinImportMeta = {
  name: "pin-import-meta",
  setup(b) {
    b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
      if (args.path.includes(`${path.sep}node_modules${path.sep}`)) return undefined;
      const source = await readFile(args.path, "utf8");
      if (!source.includes("import.meta")) return undefined;
      const contents = source
        .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(args.path).href))
        .replaceAll("import.meta.dirname", JSON.stringify(path.dirname(args.path)))
        .replaceAll("import.meta.filename", JSON.stringify(args.path));
      return { contents, loader: path.extname(args.path).slice(1).replace(/^[cm]/, "") };
    });
  },
};

await build({
  entryPoints: {
    "lab-controller": path.join(root, "platform/apps/lab-controller/src/index.ts"),
    setup: path.join(root, "platform/apps/web/scripts/setup.ts"),
  },
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Unminified so stack traces stay readable without shipping source maps.
  minify: false,
  legalComments: "none",
  logLevel: "info",
  // Optional native add-ons the libraries load inside try/catch; plain JS fallbacks are used without them.
  external: ["pg-native", "cpu-features", "*.node"],
  // CommonJS dependencies use require(), __filename and __dirname; give the ESM bundle all three.
  banner: {
    js: [
      "import { createRequire as __lfctRequire } from 'node:module';",
      "import { fileURLToPath as __lfctPath } from 'node:url';",
      "const require = __lfctRequire(import.meta.url);",
      "const __filename = __lfctPath(import.meta.url);",
      "const __dirname = __lfctPath(new URL('.', import.meta.url));",
    ].join(" "),
  },
  plugins: [pinImportMeta],
});
