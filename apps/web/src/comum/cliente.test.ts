import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MensagemServidor } from "@b3d/core";
import { FECHAMENTOS_SEM_RECONEXAO, criarCliente, type EstadoCliente } from "./cliente";

// O cliente de rede com um WebSocket de mentira: o que importa aqui é quando ele reconecta sozinho e quando não (H7.2: o expulso, 4005,
// não pode ficar tentando entrar de novo).

class SocketFalso {
  static instancias: SocketFalso[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  binaryType = "";
  enviadas: string[] = [];
  private readonly ouvintes = new Map<string, Array<(e: unknown) => void>>();

  constructor(readonly url: string) {
    SocketFalso.instancias.push(this);
  }

  addEventListener(tipo: string, fn: (e: unknown) => void): void {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), fn]);
  }

  send(dados: unknown): void {
    this.enviadas.push(typeof dados === "string" ? dados : "[binário]");
  }

  close(): void {
    this.readyState = 3;
  }

  private emitir(tipo: string, e: unknown): void {
    for (const fn of this.ouvintes.get(tipo) ?? []) fn(e);
  }

  // --- o que o servidor faria, para o teste ---
  abrir(): void {
    this.readyState = 1;
    this.emitir("open", {});
  }
  receber(msg: MensagemServidor): void {
    this.emitir("message", { data: JSON.stringify(msg) });
  }
  fecharComCodigo(code: number): void {
    this.readyState = 3;
    this.emitir("close", { code });
  }
}

const BEMVINDO: MensagemServidor = { t: "bemvindo", papel: "controle", sala: "ABCD", id: 0, token: "t", dono: false };

function abrirCliente(): { socket: SocketFalso; estados: EstadoCliente[]; fechamentos: number[]; mensagens: MensagemServidor[]; fechar: () => void } {
  const estados: EstadoCliente[] = [];
  const fechamentos: number[] = [];
  const mensagens: MensagemServidor[] = [];
  const cliente = criarCliente({
    gerarOla: () => ({ t: "ola", sala: "ABCD", apelido: "Ana" }),
    aoMensagem: (m) => mensagens.push(m),
    aoEstado: (e) => estados.push(e),
    aoFechar: (c) => fechamentos.push(c),
  });
  const socket = SocketFalso.instancias[0]!;
  socket.abrir();
  socket.receber(BEMVINDO);
  return { socket, estados, fechamentos, mensagens, fechar: () => cliente.fechar() };
}

beforeEach(() => {
  SocketFalso.instancias = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", SocketFalso);
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("location", { search: "", protocol: "http:", hostname: "localhost", host: "localhost" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cliente de rede: reconexão automática", () => {
  it("uma queda comum (1006) reconecta sozinha: é o que os testes abaixo NÃO podem fazer", () => {
    const c = abrirCliente();
    c.socket.fecharComCodigo(1006);
    expect(c.estados.at(-1)).toBe("reconectando");
    vi.advanceTimersByTime(500);
    expect(SocketFalso.instancias).toHaveLength(2);
    c.fechar();
  });

  it("4005 (expulso, H7.2): não reconecta sozinho, nem depois de muito tempo, e avisa quem usa o cliente", () => {
    const c = abrirCliente();
    c.socket.fecharComCodigo(4005);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(SocketFalso.instancias).toHaveLength(1);
    expect(c.fechamentos).toEqual([4005]);
    expect(c.estados.at(-1)).toBe("encerrado");
  });

  it("4002 (o mesmo jogador entrou em outro aparelho) e 4004 (sala encerrada) também não reconectam", () => {
    for (const codigo of [4002, 4004]) {
      SocketFalso.instancias = [];
      const c = abrirCliente();
      c.socket.fecharComCodigo(codigo);
      vi.advanceTimersByTime(60_000);
      expect(SocketFalso.instancias, `código ${codigo}`).toHaveLength(1);
      expect(c.fechamentos).toEqual([codigo]);
    }
  });

  it("o erro EXPULSO é fatal: o cliente encerra na hora e, mesmo que o fechamento chegue com outro código, não reconecta", () => {
    const c = abrirCliente();
    c.socket.receber({ t: "erro", codigo: "EXPULSO", msg: "Você foi removido da sala." });
    expect(c.mensagens.at(-1)).toMatchObject({ t: "erro", codigo: "EXPULSO" });
    expect(c.estados.at(-1)).toBe("encerrado");
    c.socket.fecharComCodigo(1005);
    vi.advanceTimersByTime(60_000);
    expect(SocketFalso.instancias).toHaveLength(1);
  });

  it("a lista dos fechamentos definitivos tem exatamente 4002, 4004 e 4005", () => {
    expect([...FECHAMENTOS_SEM_RECONEXAO].sort()).toEqual([4002, 4004, 4005]);
  });
});
