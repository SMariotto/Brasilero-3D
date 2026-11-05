import {
  ERROS_FATAIS,
  SERVIDOR,
  VERSAO_PROTOCOLO,
  type MensagemCliente,
  type MensagemServidor,
  type OlaControle,
  type OlaTela,
} from "@b3d/core";
import { urlServidor } from "./config";

/** O `ola` sem o campo `versao`, que o cliente preenche. */
export type OlaSemVersao = Omit<OlaTela, "versao"> | Omit<OlaControle, "versao">;

/**
 * conectando: socket abrindo ou esperando o `bemvindo`.
 * conectado: entrou na sala.
 * reconectando: caiu e está tentando de novo sozinho.
 * encerrado: parou de vez (erro sem volta, ou `fechar()`).
 */
export type EstadoCliente = "conectando" | "conectado" | "reconectando" | "encerrado";

export interface OpcoesCliente {
  /** Chamado a cada (re)conexão, para o `ola` sempre sair com o token e a sala mais novos. */
  gerarOla(): OlaSemVersao;
  aoMensagem(msg: MensagemServidor): void;
  /** Mensagem binária (snapshot do jogo). Só o telão recebe. */
  aoBinario?(dados: Uint8Array): void;
  aoEstado(estado: EstadoCliente): void;
  /** Ping médio (ms) das últimas medidas. */
  aoPing?(ms: number): void;
  /** O servidor fechou de propósito e o cliente não vai tentar de novo: 4002 = o mesmo jogador entrou em outro aparelho, 4004 = sala encerrada. */
  aoFechar?(codigo: number): void;
}

export interface Cliente {
  enviar(msg: Exclude<MensagemCliente, { t: "ola" }>): void;
  /** Comando do controle (7 bytes, PROTOCOLO 4). */
  enviarBinario(dados: Uint8Array): void;
  /** Manda um `ola` novo na conexão aberta (usado depois de `TOKEN_EXPIRADO`). */
  reolar(): void;
  fechar(): void;
}

const ESPERA_MAX_MS = 5000;

/**
 * WebSocket com `ola` automático, reconexão com espera crescente, ping a cada 2 s e
 * reconexão imediata quando a aba volta a ficar visível (celular que foi para o segundo plano).
 */
export function criarCliente(op: OpcoesCliente): Cliente {
  let ws: WebSocket | null = null;
  let encerrado = false;
  let entrou = false;
  let tentativa = 0;
  let timerReconexao: ReturnType<typeof setTimeout> | undefined;
  const medidas: number[] = [];

  const mudar = (e: EstadoCliente): void => {
    if (!encerrado || e === "encerrado") op.aoEstado(e);
  };

  const abrir = (): void => {
    clearTimeout(timerReconexao);
    entrou = false;
    const socket = new WebSocket(urlServidor());
    ws = socket;
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ ...op.gerarOla(), versao: VERSAO_PROTOCOLO }));
    });

    socket.addEventListener("message", (e: MessageEvent) => {
      if (e.data instanceof ArrayBuffer) {
        op.aoBinario?.(new Uint8Array(e.data));
        return;
      }
      if (typeof e.data !== "string") return;
      let msg: MensagemServidor;
      try {
        msg = JSON.parse(e.data) as MensagemServidor;
      } catch {
        return;
      }
      if (msg.t === "bemvindo") {
        entrou = true;
        tentativa = 0;
        mudar("conectado");
      } else if (msg.t === "pong") {
        medidas.push(Date.now() - msg.c);
        if (medidas.length > 5) medidas.shift();
        op.aoPing?.(Math.round(medidas.reduce((a, b) => a + b, 0) / medidas.length));
        return;
      } else if (msg.t === "erro" && ERROS_FATAIS.includes(msg.codigo)) {
        encerrado = true;
        op.aoMensagem(msg);
        mudar("encerrado");
        return;
      }
      op.aoMensagem(msg);
    });

    socket.addEventListener("close", (e: CloseEvent) => {
      if (ws !== socket) return; // conexão antiga, já trocada
      if (e.code === 4002 || e.code === 4004) {
        encerrado = true;
        op.aoFechar?.(e.code);
      }
      if (encerrado) {
        mudar("encerrado");
        return;
      }
      mudar(entrou || tentativa > 0 ? "reconectando" : "conectando");
      const espera = Math.min(ESPERA_MAX_MS, 400 * 2 ** tentativa);
      tentativa++;
      timerReconexao = setTimeout(abrir, espera);
    });
  };

  const pingar = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN && entrou) ws.send(JSON.stringify({ t: "ping", c: Date.now() }));
  }, SERVIDOR.pingIntervaloS * 1000);

  const aoVoltar = (): void => {
    if (document.visibilityState !== "visible" || encerrado) return;
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      tentativa = 0;
      abrir();
    }
  };
  document.addEventListener("visibilitychange", aoVoltar);

  mudar("conectando");
  abrir();

  return {
    enviar(msg) {
      if (ws?.readyState === WebSocket.OPEN && entrou) ws.send(JSON.stringify(msg));
    },
    enviarBinario(dados) {
      // Os comandos saem de `new Uint8Array(7)`, que é sempre um ArrayBuffer normal (nunca SharedArrayBuffer).
      if (ws?.readyState === WebSocket.OPEN && entrou) ws.send(dados as Uint8Array<ArrayBuffer>);
    },
    reolar() {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...op.gerarOla(), versao: VERSAO_PROTOCOLO }));
    },
    fechar() {
      encerrado = true;
      clearInterval(pingar);
      clearTimeout(timerReconexao);
      document.removeEventListener("visibilitychange", aoVoltar);
      ws?.close();
      op.aoEstado("encerrado");
    },
  };
}
