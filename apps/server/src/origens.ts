/**
 * Quem pode abrir o WebSocket (ARQUITETURA 4.2): o servidor só aceita páginas de origens conhecidas, para um site qualquer na
 * internet não usar o seu servidor. A lista vem da variável `ORIGENS`, separada por vírgula, por exemplo
 * `https://brasilero3d.vercel.app,https://*.vercel.app`. Um `*` no meio vale por qualquer sequência; `ORIGENS=*` libera tudo.
 */

/** Lê a variável de ambiente `ORIGENS`. */
export function lerOrigens(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function normalizar(o: string): string {
  return o.trim().toLowerCase().replace(/\/+$/, "");
}

function casaComPadrao(origem: string, padrao: string): boolean {
  const p = normalizar(padrao);
  if (p === "*") return true;
  if (!p.includes("*")) return normalizar(origem) === p;
  const regex = new RegExp("^" + p.split("*").map((parte) => parte.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
  return regex.test(normalizar(origem));
}

/** localhost, 127.x, ::1 e as faixas de rede local (10.x, 172.16 a 31, 192.168.x, 169.254.x). */
export function ehEnderecoLocal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export interface PedidoDeOrigem {
  /** Cabeçalho `Origin` (os navegadores sempre mandam; ferramentas de linha de comando e testes não). */
  origin: string | undefined;
  /** Cabeçalho `Host` do próprio pedido. */
  host: string | undefined;
}

export interface OpcoesOrigem {
  permitidas: string[];
  /** Em desenvolvimento aceita também localhost e a rede local. Em produção (`NODE_ENV=production`) só a lista e o mesmo site. */
  aceitaRedeLocal: boolean;
}

/**
 * A página que está abrindo o WebSocket pode?
 * - sem `Origin`: não é um navegador (testes, `npm run carga`), passa;
 * - mesma origem: o site é servido pelo próprio servidor (túnel do `npm run festa`), passa;
 * - na lista `ORIGENS`, passa;
 * - em desenvolvimento, localhost e rede local passam.
 */
export function origemPermitida(p: PedidoDeOrigem, o: OpcoesOrigem): boolean {
  if (!p.origin) return true;
  let url: URL;
  try {
    url = new URL(p.origin);
  } catch {
    return false; // "null" (página local aberta do disco) ou lixo
  }
  if (p.host && url.host.toLowerCase() === p.host.toLowerCase()) return true;
  if (o.permitidas.some((padrao) => casaComPadrao(p.origin!, padrao))) return true;
  return o.aceitaRedeLocal && ehEnderecoLocal(url.hostname);
}
