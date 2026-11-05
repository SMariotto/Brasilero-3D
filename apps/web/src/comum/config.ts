import { SERVIDOR } from "@b3d/core";

const CHAVE_SERVIDOR = "b3d.srv";

const ehEnderecoWs = (s: string | null | undefined): s is string => !!s && /^wss?:\/\/[^\s]+$/.test(s);

export interface EntradaEscolha {
  /** `?srv=` da URL. */
  param: string | null;
  /** Servidor lembrado de uma visita anterior (localStorage). */
  lembrado: string | null;
  /** `VITE_SERVIDOR_PADRAO`, definida no build (por exemplo na Vercel). */
  padrao: string | undefined;
  /** Rodando no `vite dev` (site e servidor em portas diferentes do mesmo PC). */
  desenvolvimento: boolean;
  protocolo: string;
  hostname: string;
  host: string;
}

/**
 * Qual servidor usar (ARQUITETURA 5.1), nesta ordem:
 * 1. `?srv=` na URL (o QR do telão leva o servidor junto);
 * 2. o que foi lembrado de uma visita anterior;
 * 3. `VITE_SERVIDOR_PADRAO` do build (site na Vercel apontando para o servidor de verdade);
 * 4. em desenvolvimento, o mesmo host da página na porta 8787 (assim o celular na rede local acha o PC);
 * 5. fora do desenvolvimento, o mesmo site (o servidor serve o site, como no túnel do `npm run festa`).
 */
export function escolherServidor(e: EntradaEscolha): string {
  if (ehEnderecoWs(e.param)) return e.param;
  if (ehEnderecoWs(e.lembrado)) return e.lembrado;
  if (ehEnderecoWs(e.padrao)) return e.padrao;
  const ws = e.protocolo === "https:" ? "wss" : "ws";
  return e.desenvolvimento ? `${ws}://${e.hostname}:${SERVIDOR.portaPadrao}/ws` : `${ws}://${e.host}/ws`;
}

/** Servidor lembrado no aparelho, ou `null` (o armazenamento pode estar bloqueado: sempre com try/catch). */
export function servidorLembrado(): string | null {
  try {
    const s = localStorage.getItem(CHAVE_SERVIDOR);
    return ehEnderecoWs(s) ? s : null;
  } catch {
    return null;
  }
}

/** Se a URL traz `?srv=`, guarda para a próxima vez (o telão aceita `?srv=wss://outro-servidor` e lembra). */
export function lembrarServidorDaUrl(): void {
  const srv = new URLSearchParams(location.search).get("srv");
  if (!ehEnderecoWs(srv)) return;
  try {
    localStorage.setItem(CHAVE_SERVIDOR, srv);
  } catch {
    // sem armazenamento: funciona, só não lembra
  }
}

/** Volta ao servidor padrão. */
export function esquecerServidor(): void {
  try {
    localStorage.removeItem(CHAVE_SERVIDOR);
  } catch {
    // nada a fazer
  }
}

/** Endereço WebSocket do servidor da partida. */
export function urlServidor(): string {
  return escolherServidor({
    param: new URLSearchParams(location.search).get("srv"),
    lembrado: servidorLembrado(),
    padrao: import.meta.env["VITE_SERVIDOR_PADRAO"] as string | undefined,
    desenvolvimento: import.meta.env.DEV,
    protocolo: location.protocol,
    hostname: location.hostname,
    host: location.host,
  });
}
