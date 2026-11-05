import { VERSAO_PROTOCOLO, type Bemvindo, type Erro, type OlaControle, type OlaTela } from "@b3d/core";
import { urlServidor } from "./config";

export type EstadoConexao = "conectando" | "conectado" | "erro" | "fechado";

/** O `ola` sem o campo `versao`, que a conexão preenche. */
export type OlaSemVersao = Omit<OlaTela, "versao"> | Omit<OlaControle, "versao">;

export interface Conexao {
  fechar(): void;
}

/**
 * Abre o WebSocket, manda o `ola` e avisa o estado. F0: sem reconexão (entra na F1).
 */
export function conectar(
  ola: OlaSemVersao,
  aoMudar: (estado: EstadoConexao, detalhe?: string) => void,
): Conexao {
  aoMudar("conectando");
  const ws = new WebSocket(urlServidor());

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ ...ola, versao: VERSAO_PROTOCOLO }));
  });

  ws.addEventListener("message", (e: MessageEvent) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data) as Bemvindo | Erro;
    if (msg.t === "bemvindo") aoMudar("conectado");
    else if (msg.t === "erro") aoMudar("erro", msg.msg);
  });

  ws.addEventListener("error", () => aoMudar("erro", "Não consegui falar com o servidor."));
  ws.addEventListener("close", () => aoMudar("fechado"));

  return { fechar: () => ws.close() };
}

export const textoEstado: Record<EstadoConexao, string> = {
  conectando: "conectando...",
  conectado: "conectado",
  erro: "erro",
  fechado: "desconectado",
};
