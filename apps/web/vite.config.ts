import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
      "/uploads": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
});
