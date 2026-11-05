import { SERVIDOR } from "@b3d/core";

/**
 * Endereço WebSocket do servidor da partida.
 * Ordem: `?srv=` na URL, variável de build `VITE_SERVIDOR_PADRAO`, e por fim o mesmo host da página na porta do servidor
 * (em desenvolvimento, é assim que o celular na rede local acha o PC). A memória do `?srv=` e o servidor dentro do QR chegam na F4.
 */
export function urlServidor(): string {
  const srv = new URLSearchParams(location.search).get("srv");
  if (srv && /^wss?:\/\//.test(srv)) return srv;

  const padrao = import.meta.env["VITE_SERVIDOR_PADRAO"] as string | undefined;
  if (padrao) return padrao;

  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  return `${protocolo}://${location.hostname}:${SERVIDOR.portaPadrao}/ws`;
}
