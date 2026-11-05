import { defineConfig } from "vite";

// Três páginas separadas (multi-page): o controle nunca importa nada de src/tela/.
// Os caminhos são relativos à pasta apps/web, que é onde o Vite roda (`-w @b3d/web`).
export default defineConfig({
  server: { host: true, port: 5173 },
  build: {
    // O Three.js (~560 KB) vai num pedaço à parte que só o telão baixa, quando a partida começa.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: "index.html",
        tela: "tela.html",
        controle: "controle.html",
      },
    },
  },
});
