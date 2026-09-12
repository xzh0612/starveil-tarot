import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {createReadingMiddleware} from './server/readings.mjs';

export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 const attach=server=>{server.middlewares.use(createReadingMiddleware({apiKey:process.env.DEEPSEEK_API_KEY||env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||env.DEEPSEEK_MODEL||'deepseek-flash'}));};
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
  },
  plugins: [react(),{name:'local-deepseek-backend',configureServer:attach,configurePreviewServer:attach}],
};});
