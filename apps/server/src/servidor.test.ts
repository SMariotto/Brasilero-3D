import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { ACAO, BOTAO, FASE, VERSAO_PROTOCOLO, anguloParaByte, codificarComando, comandoParado, decodificarSnapshot, magParaByte, type Snapshot } from "@b3d/core";
import { criarServidor, type ServidorB3D } from "./servidor";

type Msg = Record<string, any>;

/** Cliente de teste: guarda as mensagens que chegam e deixa esperar por uma de cada tipo. */
class Aparelho {
  fila: Msg[] = [];
  binarias: Uint8Array[] = [];
  fechou: number | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.on("message", (d, binario) => {
      if (binario) this.binarias.push(new Uint8Array(d as Buffer));
      else this.fila.push(JSON.parse(d.toString()));
    });
    ws.on("close", (codigo) => (this.fechou = codigo));
  }

  static abrir(porta: number): Promise<Aparelho> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
      ws.once("open", () => resolve(new Aparelho(ws)));
      ws.once("error", reject);
    });
  }

  enviar(m: unknown): void {
    this.ws.send(typeof m === "string" ? m : JSON.stringify(m));
  }

  enviarBinario(b: Uint8Array): void {
    this.ws.send(b, { binary: true });
  }

  /** O snapshot mais recente que chegou. */
  ultimoSnapshot(): Snapshot | null {
    const b = this.binarias[this.binarias.length - 1];
    return b ? decodificarSnapshot(b) : null;
  }

  async esperar(tipo: string, ms = 2000): Promise<Msg> {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      const i = this.fila.findIndex((m) => m["t"] === tipo);
      if (i >= 0) return this.fila.splice(i, 1)[0]!;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`não chegou "${tipo}"; chegou: ${JSON.stringify(this.fila)}`);
  }

  async esperarFechar(ms = 2000): Promise<number> {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (this.fechou !== null) return this.fechou;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("a conexão não fechou");
  }

  fechar(): void {
    this.ws.close();
  }
}

let servidor: ServidorB3D | undefined;
const abertos: Aparelho[] = [];

async function subir(maxSalas?: number, semBots = true): Promise<ServidorB3D> {
  servidor = await criarServidor({ porta: 0, semBots, ...(maxSalas === undefined ? {} : { maxSalas }) });
  return servidor;
}

async function novo(): Promise<Aparelho> {
  const a = await Aparelho.abrir(servidor!.porta());
  abertos.push(a);
  return a;
}

async function criarSala(): Promise<{ tela: Aparelho; sala: string }> {
  const tela = await novo();
  tela.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "criar" });
  const bv = await tela.esperar("bemvindo");
  return { tela, sala: bv["sala"] };
}

async function entrarControle(sala: string, apelido: string, token?: string): Promise<{ c: Aparelho; bv: Msg }> {
  const c = await novo();
  c.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, sala, apelido, ...(token ? { token } : {}) });
  const bv = await c.esperar("bemvindo");
  return { c, bv };
}

afterEach(async () => {
  for (const a of abertos.splice(0)) a.fechar();
  await servidor?.fechar();
  servidor = undefined;
});

describe("HTTP", () => {
  it("GET /saude responde JSON com ok, salas e conexões", async () => {
    await subir();
    const r = await fetch(`http://127.0.0.1:${servidor!.porta()}/saude`);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Msg;
    expect(corpo).toMatchObject({ ok: true, versaoProtocolo: VERSAO_PROTOCOLO, salas: 0, conexoes: 0 });
    expect(corpo).toHaveProperty("piorPassoMs");
  });

  it("GET /saude conta a sala e a conexão depois que um telão cria a sala", async () => {
    await subir();
    await criarSala();
    const corpo = (await (await fetch(`http://127.0.0.1:${servidor!.porta()}/saude`)).json()) as Msg;
    expect(corpo).toMatchObject({ salas: 1, conexoes: 1 });
  });

  it("GET /rede devolve a lista de IPs", async () => {
    await subir();
    const corpo = (await (await fetch(`http://127.0.0.1:${servidor!.porta()}/rede`)).json()) as Msg;
    expect(Array.isArray(corpo["ips"])).toBe(true);
  });

  it("rota desconhecida dá 404", async () => {
    await subir();
    expect((await fetch(`http://127.0.0.1:${servidor!.porta()}/nada`)).status).toBe(404);
  });
});

describe("telão e controle", () => {
  it("telão cria a sala (código de 4 letras, principal) e recebe o lobby", async () => {
    await subir();
    const { tela, sala } = await criarSala();
    expect(sala).toMatch(/^[A-HJ-NP-Z]{4}$/);
    const lobby = await tela.esperar("lobby");
    expect(lobby).toMatchObject({ sala, telas: 1, jogadores: [] });
  });

  it("o primeiro controle é Dono e o telão vê o apelido", async () => {
    await subir();
    const { tela, sala } = await criarSala();
    const { bv } = await entrarControle(sala.toLowerCase(), "Samuel");
    expect(bv).toMatchObject({ papel: "controle", sala, id: 0, dono: true });
    expect(bv["token"]).toMatch(/^[0-9a-f]{32}$/);

    const { bv: bv2 } = await entrarControle(sala, "Enzo");
    expect(bv2).toMatchObject({ id: 1, dono: false });

    // Pega o lobby mais recente do telão.
    await new Promise((r) => setTimeout(r, 50));
    const lobbies = tela.fila.filter((m) => m["t"] === "lobby");
    expect(lobbies.at(-1)!["jogadores"].map((j: Msg) => [j["apelido"], j["dono"]])).toEqual([
      ["Samuel", true],
      ["Enzo", false],
    ]);
  });

  it("telão extra entra pelo código com 'assistir' e o principal continua o primeiro", async () => {
    await subir();
    const { sala } = await criarSala();
    const extra = await novo();
    extra.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala });
    expect(await extra.esperar("bemvindo")).toMatchObject({ papel: "tela", sala, principal: false });
    expect(await extra.esperar("lobby")).toMatchObject({ telas: 2 });
  });

  it("ping volta como pong com o mesmo c e a hora do servidor", async () => {
    await subir();
    const { tela } = await criarSala();
    tela.enviar({ t: "ping", c: 12345 });
    const pong = await tela.esperar("pong");
    expect(pong["c"]).toBe(12345);
    expect(Math.abs(pong["s"] - Date.now())).toBeLessThan(2000);
  });

  it("comando de Dono vindo de quem não é Dono recebe SEM_PERMISSAO", async () => {
    await subir();
    const { sala } = await criarSala();
    await entrarControle(sala, "Dono");
    const { c } = await entrarControle(sala, "Outro");
    c.enviar({ t: "config", n: 3 });
    expect(await c.esperar("erro")).toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
});

describe("erros de entrada", () => {
  it("versão errada recebe VERSAO e a conexão fecha", async () => {
    await subir();
    const a = await novo();
    a.enviar({ t: "ola", versao: 999, acao: "criar" });
    expect(await a.esperar("erro")).toMatchObject({ codigo: "VERSAO" });
    expect(await a.esperarFechar()).toBe(4001);
  });

  it("primeira mensagem que não é ola recebe MENSAGEM_INVALIDA e a conexão continua", async () => {
    await subir();
    const a = await novo();
    a.enviar({ t: "ping", c: 1 });
    expect(await a.esperar("erro")).toMatchObject({ codigo: "MENSAGEM_INVALIDA" });
    a.enviar("isso não é json");
    expect(await a.esperar("erro")).toMatchObject({ codigo: "MENSAGEM_INVALIDA" });
    a.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "criar" });
    expect(await a.esperar("bemvindo")).toMatchObject({ papel: "tela" });
  });

  it("sala que não existe: SALA_NAO_EXISTE, para telão e controle, e fecha", async () => {
    await subir();
    const c = await novo();
    c.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, sala: "ZZZZ", apelido: "Sam" });
    expect(await c.esperar("erro")).toMatchObject({ codigo: "SALA_NAO_EXISTE" });
    expect(await c.esperarFechar()).toBe(4003);

    const t = await novo();
    t.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala: "ZZZZ" });
    expect(await t.esperar("erro")).toMatchObject({ codigo: "SALA_NAO_EXISTE" });
  });

  it("apelido inválido: APELIDO_INVALIDO", async () => {
    await subir();
    const { sala } = await criarSala();
    const c = await novo();
    c.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, sala, apelido: "   " });
    expect(await c.esperar("erro")).toMatchObject({ codigo: "APELIDO_INVALIDO" });
  });

  it("servidor no limite de salas: SERVIDOR_CHEIO", async () => {
    await subir(1);
    await criarSala();
    const t = await novo();
    t.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "criar" });
    expect(await t.esperar("erro")).toMatchObject({ codigo: "SERVIDOR_CHEIO" });
  });

  it("sala com 10 controles: o 11º recebe SALA_CHEIA", async () => {
    await subir();
    const { sala } = await criarSala();
    for (let i = 0; i < 10; i++) await entrarControle(sala, `J${i}`);
    const c = await novo();
    c.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, sala, apelido: "Extra" });
    expect(await c.esperar("erro")).toMatchObject({ codigo: "SALA_CHEIA" });
  });

  it("sala com 8 telões: o 9º recebe TELAS_CHEIAS", async () => {
    await subir();
    const { sala } = await criarSala();
    for (let i = 0; i < 7; i++) {
      const t = await novo();
      t.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala });
      await t.esperar("bemvindo");
    }
    const t9 = await novo();
    t9.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala });
    expect(await t9.esperar("erro")).toMatchObject({ codigo: "TELAS_CHEIAS" });
  });
});

describe("reconexão", () => {
  it("o controle que cai volta com o token como o mesmo jogador, ainda Dono", async () => {
    await subir();
    const { tela, sala } = await criarSala();
    const { c, bv } = await entrarControle(sala, "Samuel");
    await entrarControle(sala, "Enzo");

    c.fechar();
    await c.esperarFechar();
    await new Promise((r) => setTimeout(r, 50));
    const caiu = tela.fila.filter((m) => m["t"] === "lobby").at(-1)!;
    expect(caiu["jogadores"][0]).toMatchObject({ apelido: "Samuel", conectado: false });

    const { bv: bv2 } = await entrarControle(sala, "Samuel", bv["token"]);
    expect(bv2).toMatchObject({ id: bv["id"], token: bv["token"], dono: true });
    await new Promise((r) => setTimeout(r, 50));
    const voltou = tela.fila.filter((m) => m["t"] === "lobby").at(-1)!;
    expect(voltou["jogadores"][0]).toMatchObject({ apelido: "Samuel", conectado: true, dono: true });
  });

  it("token inválido: TOKEN_EXPIRADO, e na mesma conexão dá para entrar sem token", async () => {
    await subir();
    const { sala } = await criarSala();
    const c = await novo();
    c.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, sala, apelido: "Sam", token: "naoexiste" });
    expect(await c.esperar("erro")).toMatchObject({ codigo: "TOKEN_EXPIRADO" });
    expect(c.fechou).toBeNull();
    c.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, sala, apelido: "Sam" });
    expect(await c.esperar("bemvindo")).toMatchObject({ papel: "controle", id: 0 });
  });

  it("telão que cai e volta pelo código assiste de novo a mesma sala", async () => {
    await subir();
    const { tela, sala } = await criarSala();
    tela.fechar();
    await tela.esperarFechar();
    const volta = await novo();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala });
    // Sem outro telão na sala, quem volta é o mais antigo e vira o principal.
    expect(await volta.esperar("bemvindo")).toMatchObject({ sala, principal: true });
  });
});

describe("limites da conexão", () => {
  it("mensagem acima de 1 KB derruba a conexão", async () => {
    await subir();
    const a = await novo();
    a.enviar(JSON.stringify({ t: "ping", c: 1, lixo: "x".repeat(3000) }));
    await a.esperarFechar();
  });

  it("acima de 60 mensagens por segundo, o excesso é descartado", async () => {
    await subir();
    const { tela } = await criarSala();
    for (let i = 0; i < 200; i++) tela.enviar({ t: "ping", c: i });
    await new Promise((r) => setTimeout(r, 400));
    const pongs = tela.fila.filter((m) => m["t"] === "pong").length;
    expect(pongs).toBeGreaterThan(40);
    expect(pongs).toBeLessThanOrEqual(60);
  });

  it("sem ola em 5 s a conexão é fechada", async () => {
    await subir();
    const a = await novo();
    expect(await a.esperarFechar(7000)).toBe(4000);
  }, 10000);
});

describe("partida pelo WebSocket", () => {
  async function iniciarPartida(): Promise<{ tela: Aparelho; a: Aparelho; b: Aparelho; sala: string }> {
    const { tela, sala } = await criarSala();
    const { c: a } = await entrarControle(sala, "Ana");
    const { c: b } = await entrarControle(sala, "Beto");
    a.enviar({ t: "lado", lado: "casa" });
    b.enviar({ t: "lado", lado: "visitante" });
    a.enviar({ t: "comecar" });
    await tela.esperar("partida");
    await a.esperar("voce");
    return { tela, a, b, sala };
  }

  it("o Dono começa e telão e controles recebem a partida; o telão recebe snapshots binários a cerca de 30 por segundo", async () => {
    await subir();
    const { tela, a, b } = await iniciarPartida();
    expect((await b.esperar("partida"))["elenco"]).toHaveLength(2);
    const base = tela.binarias.length;
    await new Promise((r) => setTimeout(r, 1000));
    const n = tela.binarias.length - base;
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(40);
    const s = tela.ultimoSnapshot()!;
    expect(s.jogadores.map((j) => j.slot)).toEqual([1, 7]);
    expect(s.fase).toBe(FASE.preJogo);
    expect(a.binarias).toHaveLength(0);
  });

  it("o comando binário do celular mexe no jogador e o snapshot mostra", async () => {
    await subir();
    const { tela, a, sala: codigo } = await iniciarPartida();
    // Rota de teste: solta o jogo e põe a Ana e a bola em lugares conhecidos
    const r = await fetch(`http://127.0.0.1:${servidor!.porta()}/teste/posicionar`, {
      method: "POST",
      body: JSON.stringify({ sala: codigo, id: 0, x: 0, z: 0, bolaX: 10, bolaZ: 10 }),
    });
    expect(((await r.json()) as Msg)["ok"]).toBe(true);
    await new Promise((res) => setTimeout(res, 150));

    // Joystick para a direita (+X) com força máxima
    a.enviarBinario(codificarComando({ ...comandoParado(), ang: anguloParaByte(0), mag: magParaByte(1) }));
    await new Promise((res) => setTimeout(res, 600));
    const s = tela.ultimoSnapshot()!;
    expect(s.fase).toBe(FASE.jogo);
    const ana = s.jogadores.find((j) => j.slot === 1)!;
    expect(ana.x).toBeGreaterThan(2);
    expect(Math.abs(ana.z)).toBeLessThan(0.5);
  });

  it("segurar CHUTE perto do gol e soltar faz gol: o placar sobe e vem o evento", async () => {
    await subir();
    const { tela, a, sala: codigo } = await iniciarPartida();
    await fetch(`http://127.0.0.1:${servidor!.porta()}/teste/posicionar`, {
      method: "POST",
      body: JSON.stringify({ sala: codigo, id: 0, x: 20, z: 0, bolaX: 20.55, bolaZ: 0 }),
    });
    await new Promise((res) => setTimeout(res, 300));
    a.enviarBinario(codificarComando({ ...comandoParado(), seguros: BOTAO.chute }));
    await new Promise((res) => setTimeout(res, 800));
    a.enviarBinario(codificarComando({ ...comandoParado(), acao: ACAO.chute, forca: 255, acaoSeq: 1 }));
    const gol = await tela.esperar("evento", 3000).then(async (e) => {
      let ev = e;
      while (ev["tipo"] !== "gol") ev = await tela.esperar("evento", 3000);
      return ev;
    });
    expect(gol["dados"]).toMatchObject({ time: 0, slot: 1, contra: false, placar: [1, 0] });
    await new Promise((res) => setTimeout(res, 100));
    expect(tela.ultimoSnapshot()!.golsCasa).toBe(1);
  });

  it("a rota de teste fica desligada fora do modo de teste", async () => {
    servidor = await criarServidor({ porta: 0, rotasDeTeste: false });
    const r = await fetch(`http://127.0.0.1:${servidor.porta()}/teste/posicionar`, { method: "POST", body: "{}" });
    expect(r.status).toBe(404);
  });

  it("o /saude mostra o pior tempo de passo depois de uma partida rodar", async () => {
    await subir();
    await iniciarPartida();
    await new Promise((r) => setTimeout(r, 400));
    const corpo = (await (await fetch(`http://127.0.0.1:${servidor!.porta()}/saude`)).json()) as Msg;
    expect(corpo["piorPassoMs"]).toBeGreaterThan(0);
    expect(corpo["piorPassoMs"]).toBeLessThan(50);
  });
});
