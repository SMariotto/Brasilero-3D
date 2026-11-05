import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { VERSAO_PROTOCOLO } from "@b3d/core";
import { criarServidor, type ServidorB3D } from "./servidor";

let servidor: ServidorB3D | undefined;

afterEach(async () => {
  await servidor?.fechar();
  servidor = undefined;
});

/** Abre um WebSocket, manda `enviar` e devolve a primeira resposta em JSON. */
function conversar(porta: number, enviar: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
    ws.on("open", () => ws.send(JSON.stringify(enviar)));
    ws.on("message", (d) => {
      resolve(JSON.parse(d.toString()));
      ws.close();
    });
    ws.on("error", reject);
  });
}

describe("servidor", () => {
  it("GET /saude responde JSON com ok", async () => {
    servidor = await criarServidor({ porta: 0 });
    const r = await fetch(`http://127.0.0.1:${servidor.porta()}/saude`);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo["ok"]).toBe(true);
    expect(corpo["versaoProtocolo"]).toBe(VERSAO_PROTOCOLO);
    expect(corpo).toHaveProperty("salas");
    expect(corpo).toHaveProperty("piorPassoMs");
  });

  it("rota desconhecida dá 404", async () => {
    servidor = await criarServidor({ porta: 0 });
    const r = await fetch(`http://127.0.0.1:${servidor.porta()}/nada`);
    expect(r.status).toBe(404);
  });

  it("telão manda ola e recebe bemvindo", async () => {
    servidor = await criarServidor({ porta: 0 });
    const r = await conversar(servidor.porta(), { t: "ola", versao: VERSAO_PROTOCOLO, acao: "criar" });
    expect(r["t"]).toBe("bemvindo");
    expect(r["papel"]).toBe("tela");
  });

  it("controle manda ola e recebe bemvindo", async () => {
    servidor = await criarServidor({ porta: 0 });
    const r = await conversar(servidor.porta(), { t: "ola", versao: VERSAO_PROTOCOLO, sala: "ABCD", apelido: "Sam" });
    expect(r["t"]).toBe("bemvindo");
    expect(r["papel"]).toBe("controle");
    expect(r["sala"]).toBe("ABCD");
  });

  it("versão errada recebe erro VERSAO", async () => {
    servidor = await criarServidor({ porta: 0 });
    const r = await conversar(servidor.porta(), { t: "ola", versao: 999, acao: "criar" });
    expect(r["t"]).toBe("erro");
    expect(r["codigo"]).toBe("VERSAO");
  });

  it("primeira mensagem que não é ola recebe MENSAGEM_INVALIDA", async () => {
    servidor = await criarServidor({ porta: 0 });
    const r = await conversar(servidor.porta(), { t: "ping", c: 1 });
    expect(r["t"]).toBe("erro");
    expect(r["codigo"]).toBe("MENSAGEM_INVALIDA");
  });
});
