import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

const API = "http://localhost:8788";

interface Celular {
  page: Page;
  cdp: CDPSession;
}

/** Abre um celular de mentira (tela deitada, com toque) e entra na sala. */
async function entrarComoCelular(browser: Browser, sala: string, apelido: string, lado: "casa" | "visitante"): Promise<Celular> {
  const contexto = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await contexto.newPage();
  await page.goto(`/controle.html?sala=${sala}`);
  await page.locator("#apelido").fill(apelido);
  await page.locator("#botao-entrar").click();
  await page.locator(`.lado.${lado}`).click();
  await expect(page.locator(`.lado.${lado}.ativo`)).toBeVisible();
  return { page, cdp: await contexto.newCDPSession(page) };
}

/** Toque de verdade (multitoque): Input.dispatchTouchEvent com a lista de dedos que estão na tela. */
async function toque(c: Celular, tipo: "touchStart" | "touchMove" | "touchEnd", dedos: { x: number; y: number; id: number }[]): Promise<void> {
  await c.page.bringToFront();
  await c.cdp.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: dedos });
}

async function centro(page: Page, seletor: string): Promise<{ x: number; y: number }> {
  const caixa = await page.locator(seletor).boundingBox();
  if (!caixa) throw new Error(`Não achei ${seletor}`);
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}

test("telão e dois celulares: entram, começam, um segura CHUTE perto do gol e o placar muda", async ({ browser, request }) => {
  // Telão
  const telao = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await telao.goto("/tela.html");
  await telao.locator("#criar").click();
  await expect(telao.locator(".codigo")).toHaveText(/^[A-Z]{4}$/);
  const sala = (await telao.locator(".codigo").textContent())!;

  // Dois celulares: Ana (líder, Casa) e Beto (Visitante)
  const ana = await entrarComoCelular(browser, sala, "Ana", "casa");
  const beto = await entrarComoCelular(browser, sala, "Beto", "visitante");
  await expect(telao.locator(".time.casa .jogador .nome")).toHaveText("Ana");
  await expect(telao.locator(".time.visitante .jogador .nome")).toHaveText("Beto");

  // O líder começa a partida: telão e celulares trocam para a tela de jogo
  await ana.page.locator(".comecar").click();
  await expect(telao.locator("#jogo")).toBeVisible();
  await expect(telao.locator("#canvas-host canvas")).toBeVisible();
  await expect(telao.locator("#placar")).toContainText("FLA");
  await expect(telao.locator("#gols-casa")).toHaveText("0");
  await expect(ana.page.locator("#jogo")).toBeVisible();
  await expect(beto.page.locator("#jogo")).toBeVisible();
  await expect(ana.page.locator(".botao-jogo.chute")).toHaveText(/^TROCAR/); // sem a bola o rótulo é outro (G1: CHUTE sem a bola troca de jogador)

  // Rota de teste: põe a Ana perto do gol, olhando para ele, com a bola no pé (e solta o jogo)
  const posicionou = await request.post(`${API}/teste/posicionar`, { data: { sala, id: 0, x: 20, z: 0, bolaX: 20.55, bolaZ: 0 } });
  expect(((await posicionou.json()) as { ok: boolean }).ok).toBe(true);
  await expect(ana.page.locator(".botao-jogo.chute")).toHaveText("CHUTE"); // agora ela tem a bola

  // Segura CHUTE por ~0,9 s (carga cheia) e solta
  const botaoChute = await centro(ana.page, ".botao-jogo.chute");
  await toque(ana, "touchStart", [{ ...botaoChute, id: 1 }]);
  await expect(ana.page.locator(".botao-jogo.chute.apertado")).toBeVisible();
  await ana.page.waitForTimeout(900);
  const carga = await ana.page.locator(".barra-carga i").evaluate((e) => (e as HTMLElement).style.width);
  expect(parseFloat(carga)).toBeGreaterThan(90);
  await toque(ana, "touchEnd", []);

  // Gol: o placar do telão muda e aparece o GOOOL com quem fez
  await expect(telao.locator("#gols-casa")).toHaveText("1");
  await expect(telao.locator("#faixa-gol")).toContainText("GOOOL");
  await expect(telao.locator("#faixa-gol")).toContainText("Ana");
  await expect(telao.locator("#gols-visitante")).toHaveText("0");
});

test("o joystick do celular move o jogador e o telão mostra", async ({ browser, request }) => {
  const telao = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await telao.goto("/tela.html");
  await telao.locator("#criar").click();
  await expect(telao.locator(".codigo")).toHaveText(/^[A-Z]{4}$/);
  const sala = (await telao.locator(".codigo").textContent())!;

  const ana = await entrarComoCelular(browser, sala, "Ana", "casa");
  await ana.page.locator(".comecar").click();
  await expect(telao.locator("#jogo")).toBeVisible();

  // Põe a Ana no meio do campo e a bola longe, e empurra o joystick para a direita
  await request.post(`${API}/teste/posicionar`, { data: { sala, id: 0, x: 0, z: 0, bolaX: 10, bolaZ: 10 } });
  await toque(ana, "touchStart", [{ x: 150, y: 250, id: 0 }]);
  await toque(ana, "touchMove", [{ x: 200, y: 250, id: 0 }]); // 50 px para a direita
  await ana.page.waitForTimeout(1200);
  await toque(ana, "touchEnd", []);

  // O servidor confirma: ela andou para +X (direita da tela) e ficou na mesma altura
  const estado = (await (await request.get(`${API}/teste/estado?sala=${sala}`)).json()) as { jogadores: { slot: number; x: number; z: number }[] };
  const eu = estado.jogadores.find((j) => j.slot === 1)!;
  expect(eu.x).toBeGreaterThan(3);
  expect(Math.abs(eu.z)).toBeLessThan(0.5);

  const saude = (await (await request.get(`${API}/saude`)).json()) as { piorPassoMs: number };
  expect(saude.piorPassoMs).toBeLessThan(50);
});

test("telão extra: um amigo abre 'Assistir uma sala' no meio da partida e vê o jogo, com a própria câmera", async ({ browser }) => {
  const telao = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await telao.goto("/tela.html");
  await telao.locator("#criar").click();
  await expect(telao.locator(".codigo")).toHaveText(/^[A-Z]{4}$/);
  const sala = (await telao.locator(".codigo").textContent())!;

  const ana = await entrarComoCelular(browser, sala, "Ana", "casa");
  await ana.page.locator(".comecar").click();
  await expect(telao.locator("#jogo")).toBeVisible();

  // O amigo (outra casa) abre o telão, digita o código e assiste
  const amigo = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await amigo.goto("/tela.html");
  await amigo.locator("#codigo").fill(sala.toLowerCase());
  await amigo.getByRole("button", { name: "Assistir uma sala" }).click();
  await expect(amigo.locator("#jogo")).toBeVisible();
  await expect(amigo.locator("#canvas-host canvas")).toBeVisible();
  await expect(amigo.locator("#placar")).toContainText("FLA");

  // Os dois telões veem o mesmo jogo, mas só um é o principal; cada um escolhe a própria câmera
  await amigo.locator("#botao-camera").click();
  await amigo.keyboard.press("c");
  await expect(amigo.locator("#placar")).toBeVisible();
  await expect(telao.locator("#placar")).toBeVisible();

  // Sala que não existe: volta ao início com o aviso
  const perdido = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await perdido.goto("/tela.html");
  await perdido.locator("#codigo").fill("ZZZZ");
  await perdido.getByRole("button", { name: "Assistir uma sala" }).click();
  await expect(perdido.locator("#aviso-inicio")).toContainText("Não achei essa sala");
});

test("servidor lembrado: o ?srv= fica guardado e dá para voltar ao padrão", async ({ browser }) => {
  const pagina = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await pagina.goto("/tela.html?srv=" + encodeURIComponent("ws://localhost:8788/ws"));
  await expect(pagina.locator("#servidor-lembrado")).toBeVisible();
  await expect(pagina.locator("#servidor-texto")).toHaveText("ws://localhost:8788/ws");
  await pagina.reload();
  await expect(pagina.locator("#servidor-lembrado")).toBeVisible();
  await pagina.getByRole("button", { name: "Voltar ao padrão" }).click();
  await expect(pagina.locator("#servidor-lembrado")).toBeHidden();
});
