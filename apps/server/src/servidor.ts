import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { SERVIDOR, VERSAO_PROTOCOLO, papelDoOla, pareceOla, type Bemvindo, type Erro } from "@b3d/core";

export interface OpcoesServidor {
  /** Porta HTTP e WebSocket. 0 deixa o sistema escolher (usado nos testes). */
  porta: number;
}

export interface ServidorB3D {
  http: Server;
  /** Porta em que está escutando (útil quando `porta` era 0). */
  porta(): number;
  fechar(): Promise<void>;
}

const enviar = (ws: WebSocket, msg: Bemvindo | Erro): void => ws.send(JSON.stringify(msg));

/**
 * Servidor HTTP (`GET /saude`) com WebSocket em `/ws`.
 * F0: só responde `ola` com `bemvindo`. As salas entram na F1.
 */
export function criarServidor({ porta }: OpcoesServidor): Promise<ServidorB3D> {
  const inicio = Date.now();
  let conexoes = 0;

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/saude") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
      res.end(
        JSON.stringify({
          ok: true,
          versaoProtocolo: VERSAO_PROTOCOLO,
          salas: 0,
          conexoes,
          piorPassoMs: 0,
          ativoHaS: Math.round((Date.now() - inicio) / 1000),
        }),
      );
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

  wss.on("connection", (ws) => {
    conexoes++;
    ws.on("close", () => {
      conexoes--;
    });
    ws.on("error", () => ws.terminate());

    // Sem `ola` no prazo, fecha.
    const prazo = setTimeout(() => ws.close(4000, "sem ola"), SERVIDOR.olaTimeoutS * 1000);
    let cumprimentou = false;

    ws.on("message", (dados: RawData, binario: boolean) => {
      if (binario) return; // comandos binários só existem a partir da F2
      let msg: unknown;
      try {
        msg = JSON.parse(dados.toString());
      } catch {
        enviar(ws, { t: "erro", codigo: "MENSAGEM_INVALIDA", msg: "Mensagem inválida." });
        return;
      }
      if (cumprimentou) return;
      if (!pareceOla(msg)) {
        enviar(ws, { t: "erro", codigo: "MENSAGEM_INVALIDA", msg: "A primeira mensagem tem que ser um ola." });
        return;
      }
      if (msg.versao !== VERSAO_PROTOCOLO) {
        enviar(ws, { t: "erro", codigo: "VERSAO", msg: "Atualize a página." });
        ws.close(4001, "versao");
        return;
      }
      cumprimentou = true;
      clearTimeout(prazo);
      const papel = papelDoOla(msg);
      enviar(ws, { t: "bemvindo", papel, sala: msg.sala ?? "----" });
    });

    ws.on("close", () => clearTimeout(prazo));
  });

  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(porta, "0.0.0.0", () => {
      resolve({
        http,
        porta: () => (http.address() as AddressInfo).port,
        fechar: () =>
          new Promise<void>((ok) => {
            for (const cliente of wss.clients) cliente.terminate();
            wss.close(() => http.close(() => ok()));
            http.closeAllConnections();
          }),
      });
    });
  });
}
