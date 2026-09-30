import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  build: {
    target: ["chrome109", "edge109", "firefox115", "safari16.4"],
  },
});
