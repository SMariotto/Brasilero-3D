import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  SERVIDOR,
  VERSAO_PROTOCOLO,
  lerMensagemCliente,
  papelDoOla,
  type CodigoErro,
  type MensagemServidor,
  type Ola,
} from "@b3d/core";
import { LimiteTaxa } from "./limite";
import { ipsDaRede } from "./rede";
import type { Canal, Jogador, Sala, Tela } from "./sala";
import { Salas } from "./salas";

export interface OpcoesServidor {
  /** Porta HTTP e WebSocket. 0 deixa o sistema escolher (usado nos testes). */
  porta: number;
  maxSalas?: number;
}

export interface ServidorB3D {
  http: Server;
  salas: Salas;
  /** Porta em que está escutando (útil quando `porta` era 0). */
  porta(): number;
  fechar(): Promise<void>;
}

type Contexto = { tipo: "tela"; sala: Sala; tela: Tela } | { tipo: "controle"; sala: Sala; jogador: Jogador };

const CORS = { "access-control-allow-origin": "*" };

/**
 * Servidor HTTP (`GET /saude`, `GET /rede`) com WebSocket em `/ws`: salas, lobby, reconexão e ping.
 * O jogo (física, regras) entra na F2.
 */
export function criarServidor({ porta, maxSalas }: OpcoesServidor): Promise<ServidorB3D> {
  const inicio = Date.now();
  const salas = new Salas(maxSalas === undefined ? {} : { maxSalas });

  const json = (res: import("node:http").ServerResponse, corpo: unknown): void => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify(corpo));
  };

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/saude") {
      json(res, {
        ok: true,
        versaoProtocolo: VERSAO_PROTOCOLO,
        salas: salas.total,
        conexoes: salas.conexoes,
        piorPassoMs: 0, // sem laço de jogo ainda (F2)
        ativoHaS: Math.round((Date.now() - inicio) / 1000),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/rede") {
      json(res, { ips: ipsDaRede() });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Brasilero 3D: servidor da partida. Use /saude ou o WebSocket em /ws.");
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: SERVIDOR.maxBytesMensagem });

  http.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    const canal: Canal = {
      enviar: (msg: MensagemServidor) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      fechar: (codigo, motivo) => ws.close(codigo, motivo),
    };
    const erro = (codigo: CodigoErro, msg: string): void => canal.enviar({ t: "erro", codigo, msg });
    const limite = new LimiteTaxa(SERVIDOR.maxMensagensPorSegundo);
    let contexto: Contexto | null = null;

    // Sem `ola` no prazo, fecha.
    const prazo = setTimeout(() => ws.close(4000, "sem ola"), SERVIDOR.olaTimeoutS * 1000);

    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      clearTimeout(prazo);
      if (contexto?.tipo === "tela") contexto.sala.sairTela(contexto.tela);
      else if (contexto?.tipo === "controle") contexto.sala.desconectarControle(contexto.jogador, canal);
    });

    const entrar = (ola: Ola): void => {
      if (ola.versao !== VERSAO_PROTOCOLO) {
        erro("VERSAO", "Atualize a página.");
        ws.close(4001, "versao");
        return;
      }

      const recusar = (codigo: CodigoErro, msg: string): void => {
        erro(codigo, msg);
        // Token vencido não é o fim: o aparelho pode mandar um `ola` novo, sem token, nesta mesma conexão.
        if (codigo !== "TOKEN_EXPIRADO") ws.close(4003, codigo);
      };

      if (papelDoOla(ola) === "tela") {
        const o = ola as Extract<Ola, { acao: string }>;
        let sala: Sala | null | undefined;
        if (o.acao === "criar") {
          sala = salas.criar();
          if (!sala) return recusar("SERVIDOR_CHEIO", "O servidor está cheio. Tente daqui a pouco.");
        } else {
          sala = salas.achar(o.sala ?? "");
          if (!sala) return recusar("SALA_NAO_EXISTE", "Não achei essa sala.");
        }
        const r = sala.entrarTela(canal);
        if (!r.ok) return recusar(r.codigo, r.msg);
        contexto = { tipo: "tela", sala, tela: r.valor };
      } else {
        const o = ola as Extract<Ola, { apelido: string }>;
        const sala = salas.achar(o.sala);
        if (!sala) return recusar("SALA_NAO_EXISTE", "Não achei essa sala.");
        const r = sala.entrarControle(canal, o.apelido, o.token);
        if (!r.ok) return recusar(r.codigo, r.msg);
        contexto = { tipo: "controle", sala, jogador: r.valor };
      }
      clearTimeout(prazo);
    };

    ws.on("message", (dados: RawData, binario: boolean) => {
      if (binario) return; // comandos binários só existem a partir da F2
      if (!limite.permitir()) return;

      const msg = lerMensagemCliente(dados.toString());
      if (!msg) {
        erro("MENSAGEM_INVALIDA", "Mensagem inválida.");
        return;
      }

      if (!contexto) {
        if (msg.t === "ola") entrar(msg);
        else erro("MENSAGEM_INVALIDA", "A primeira mensagem tem que ser um ola.");
        return;
      }

      if (msg.t === "ola") return; // já entrou
      if (msg.t === "ping") {
        canal.enviar({ t: "pong", c: msg.c, s: Date.now() });
        return;
      }
      if (contexto.tipo === "tela") contexto.sala.tratarTela(contexto.tela, msg);
      else contexto.sala.tratarControle(contexto.jogador, msg);
    });
  });

  const manutencao = setInterval(() => salas.varrer(), 1000);
  manutencao.unref();

  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(porta, "0.0.0.0", () => {
      resolve({
        http,
        salas,
        porta: () => (http.address() as AddressInfo).port,
        fechar: () =>
          new Promise<void>((ok) => {
            clearInterval(manutencao);
            for (const cliente of wss.clients) cliente.terminate();
            wss.close(() => http.close(() => ok()));
            http.closeAllConnections();
          }),
      });
    });
  });
}
