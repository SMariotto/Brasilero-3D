// Partes puras do `npm run festa` (com teste em festa-util.test.mjs): ler o endereço do túnel e montar os links.

/** Acha o endereço `https://alguma-coisa.trycloudflare.com` na saída do cloudflared. `null` se ainda não apareceu. */
export function extrairUrlDoTunel(texto) {
  const m = /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/i.exec(texto);
  return m ? m[0].toLowerCase() : null;
}

/** `https://x.trycloudflare.com` vira `wss://x.trycloudflare.com/ws`. */
export function wsDoTunel(tunel) {
  return tunel.replace(/^https:/i, "wss:").replace(/\/+$/, "") + "/ws";
}

/**
 * Os links que o Samuel usa.
 * - `telao`: o site servido pelo próprio servidor, pelo túnel (funciona sem Vercel);
 * - `telaoNoSite`: o mesmo telão pelo site da Vercel (`siteExterno`), apontando para o túnel com `?srv=`;
 * - `controle`: para digitar o código no celular de quem não vai pelo QR.
 */
export function montarLinks({ tunel, siteExterno }) {
  const base = tunel.replace(/\/+$/, "");
  const srv = encodeURIComponent(wsDoTunel(base));
  const links = {
    telao: `${base}/tela.html?srv=${srv}`,
    controle: `${base}/controle.html?srv=${srv}`,
    ws: wsDoTunel(base),
  };
  if (siteExterno) {
    const externo = siteExterno.replace(/\/+$/, "");
    links.telaoNoSite = `${externo}/tela.html?srv=${srv}`;
    links.controleNoSite = `${externo}/controle.html?srv=${srv}`;
  }
  return links;
}

/** ORIGENS do servidor da festa: o site externo (se houver) somado ao que o Samuel já tinha definido. */
export function origensDaFesta(siteExterno, existentes) {
  const lista = (existentes ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (siteExterno) lista.push(siteExterno.replace(/\/+$/, ""));
  return [...new Set(lista)].join(",");
}

/** Instrução de instalação do cloudflared para o Windows. */
export const AJUDA_CLOUDFLARED = `O cloudflared não está instalado (ou não está no PATH).
Instale com este comando no PowerShell e rode o npm run festa de novo:

  winget install --id Cloudflare.cloudflared

Depois de instalar, feche e abra o PowerShell (o PATH só atualiza em janela nova).`;
