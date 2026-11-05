import { urlServidor } from "../comum/config";

const NOMES_LOCAIS = ["localhost", "127.0.0.1", "[::1]", "::1"];

export interface EnderecoCelular {
  /** Origem do site que o celular deve abrir, por exemplo `http://192.168.0.10:5173`. */
  origem: string;
  /** Endereço WebSocket que o celular deve usar. */
  srv: string;
}

/**
 * Endereço que o CELULAR consegue abrir. Se o telão está em `localhost` (desenvolvimento), o celular não enxerga isso:
 * pergunta ao servidor qual é o IP do PC na rede local e troca. Em produção (site na Vercel, túnel) não muda nada.
 */
export async function enderecoParaCelular(): Promise<EnderecoCelular> {
  const srv = urlServidor();
  const padrao: EnderecoCelular = { origem: location.origin, srv };
  if (!NOMES_LOCAIS.includes(location.hostname)) return padrao;

  try {
    const url = new URL(srv);
    const http = new URL(url.href.replace(/^ws/, "http"));
    http.pathname = "/rede";
    http.search = "";
    const resposta = await fetch(http, { signal: AbortSignal.timeout(2000) });
    const { ips } = (await resposta.json()) as { ips?: string[] };
    const ip = ips?.[0];
    if (!ip) return padrao;

    if (NOMES_LOCAIS.includes(url.hostname)) url.hostname = ip;
    const origem = new URL(location.origin);
    origem.hostname = ip;
    return { origem: origem.origin, srv: url.href };
  } catch {
    return padrao;
  }
}
