import { defineConfig } from "@playwright/test";

// Teste de ponta a ponta (`npm run e2e`): sobe um servidor de teste (porta 8788, com a rota /teste/posicionar ligada) e o site
// (porta 5183), abre um telão e dois celulares de mentira e joga. Usa o Edge que já vem no Windows, sem baixar navegador.
// Sem Edge: `npx playwright install chromium` e rode com B3D_NAVEGADOR=chromium.
const PORTA_SERVIDOR = 8788;
const PORTA_SITE = 5183;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORTA_SITE}`,
    ...(process.env["B3D_NAVEGADOR"] === "chromium" ? {} : { channel: "msedge" }),
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start -w @b3d/server",
      // SEM_BOTS: o teste é de 1 contra 1 sem goleiro, para o gol ser certo; os bots têm testes próprios.
      env: { PORT: String(PORTA_SERVIDOR), NODE_ENV: "test", SEM_BOTS: "1" },
      url: `http://localhost:${PORTA_SERVIDOR}/saude`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w @b3d/web -- --port ${PORTA_SITE} --strictPort`,
      env: { VITE_SERVIDOR_PADRAO: `ws://localhost:${PORTA_SERVIDOR}/ws` },
      url: `http://localhost:${PORTA_SITE}/tela.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
