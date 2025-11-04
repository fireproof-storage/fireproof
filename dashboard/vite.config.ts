import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// import { visualizer } from "rollup-plugin-visualizer";
||||||| parent of 33350045 (chore: lets test the deployment)
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { dotenv } from "zx";
import { cloudflare } from "@cloudflare/vite-plugin";
import * as path from "path";
import * as fs from "fs";
import * as esbuild from "esbuild";

const serveFireproofAssets = (): Plugin => ({
  name: "serve-fireproof-assets",

  // Development server
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      // Serve the HTML file
      let url = req.url?.split("?")[0] || "";
      if (url.startsWith("/@fireproof")) {
        if (url === "/@fireproof/cloud-connector-svc") {
          url += "/index.js";
        }

        const filePath = path.resolve(__dirname, `node_modules/${url}`);
        if (url.endsWith(".html")) {
          const content = await fs.promises.readFile(filePath, "utf-8");
          res.setHeader("Content-Type", "text/html");
          res.end(content);
          return;
        }
        try {
          // Use Vite's built-in transform
          const result = await server.transformRequest(filePath);
          if (result) {
            res.setHeader("Content-Type", "application/javascript");
            res.end(result.code);
            return;
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(`Error: ${e}`);
          return;
        }
        // console.log("serve-fireproof-assets", req.url, url);

        // const content = fs.readFileSync(htmlPath, "utf-8");
        // res.setHeader("Content-Type", "text/html");
        // res.end(content);
        return;
      }
      next();
    });
  },

  async generateBundle() {
    // Emit HTML file
    const htmlPath = path.resolve(__dirname, "node_modules/@fireproof/cloud-connector-iframe/injected-iframe.html");
    this.emitFile({
      type: "asset",
      fileName: "@fireproof/cloud-connector-iframe/injected-iframe.html",
      source: fs.readFileSync(htmlPath, "utf-8"),
    });

    const result = await esbuild.build({
      entryPoints: [path.resolve(__dirname, "node_modules/@fireproof/cloud-connector-svc/index.ts")],
      bundle: true,
      format: "esm",
      write: false,
      minify: false,
      platform: "browser",
    });

    const bundledCode = result.outputFiles[0].text;

    this.emitFile({
      type: "asset",
      fileName: "@fireproof/cloud-connector-svc/index.js",
      source: bundledCode,
    });
  },
});

function defines() {
  try {
    return Object.entries(dotenv.load(".dev.vars")).reduce(
      (acc, [key, value]) => {
        // Double stringify: once to make it a string, twice to make it a JSON string literal
        acc[`import.meta.env.${key}`] = JSON.stringify(value);
        return acc;
      },
      {} as Record<string, string>,
    );
  } catch (e) {
    console.warn("no .dev.vars found");
    return {};
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    serveFireproofAssets(),
    // multilines
    // tsconfigPaths(),
    react({
      jsxRuntime: "classic", // Use classic instead of automatic
    }),
    cloudflare(),
    // visualizer(),
    {
      name: "serve-fp-cloud-connector",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/fp-cloud-connector/")) {
            const filePath = path.join(__dirname, req.url.split("?")[0]);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const ext = path.extname(filePath);
              // Only serve HTML directly, let Vite handle .ts/.js files
              if (ext === ".html") {
                const content = fs.readFileSync(filePath);
                res.setHeader("Content-Type", "text/html");
                res.end(content);
                return;
              }
              // For .ts/.js files, let Vite's normal processing handle them
            }
          }
          next();
        });
      },
    },
>>>>>>> 4cf9f42f (chore: intro of fp-cloud-connector)
  ],
  define: {
    ...defines(),
  },
  build: {
    sourcemap: true,
    target: "esnext",
    outDir: "./dist/static",
    emptyOutDir: true, // also necessary
    manifest: true,
  },
  //  optimizeDeps: {
  //    include: ['use-fireproof']
  //  },
  server: {
    port: 7370,
    // hmr: false,
    fs: {
      allow: [
        // Allow serving files from the project root
        "..",
      ],
    },
    allowedHosts: ["localhost", "dev-local-1.adviser.com", "dev-local-2.adviser.com"],
  },
  resolve: {
    //    ...(process.env.USE_SOURCE
    //    ? {
    //        alias: {
    //          "react-router": path.resolve(__dirname, "../../packages/react-router/index.js"),
    //          "react-router-dom": path.resolve(__dirname, "../../packages/react-router-dom/index.jsx"),
    //        },
    //      }
    //    : {},
    //    ),
  },
});

// console.log(">>>>>>", path.resolve(__dirname, "node_modules/@fireproof/cloud-connector-svc/index.ts"));
