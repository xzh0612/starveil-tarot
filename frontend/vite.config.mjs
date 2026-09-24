import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The reading agent is a separate Python service (see backend/). Vite proxies only
// the four agent endpoints, so every other path still behaves exactly as before —
// including the Sites build, which never ships the agent.
const AGENT_PATHS = [
  "/api/readings/interpret",
  "/api/readings/debug",
  "/api/readings/status",
  "/api/spreads/recommend",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const agentPort = process.env.STARVEIL_AGENT_PORT || env.STARVEIL_AGENT_PORT || "8787";
  // changeOrigin must stay false: the agent rejects requests whose Origin host
  // does not match the Host header it receives.
  const proxy = Object.fromEntries(
    AGENT_PATHS.map((path) => [path, { target: `http://127.0.0.1:${agentPort}`, changeOrigin: false }]),
  );
  return {
    build: {
      outDir: "dist/client",
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
      proxy,
    },
    preview: {
      proxy,
    },
    plugins: [react()],
  };
});
