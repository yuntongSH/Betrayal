import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client talks to the authoritative game server over WebSockets.
// In dev, point at the local server; override with VITE_SERVER_URL in prod.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
