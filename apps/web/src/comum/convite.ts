// O convite que o menu do celular mostra e compartilha (H7.4b). Lógica pura, com teste. O PC monta o dele (com QR) em `tela/main.ts`; o celular
// não tem a biblioteca do QR (o limite de 300 KB do controle) e usa o endereço pelo qual ele mesmo chegou.

/** O dado do bloco "Convidar" que cada lado fornece ao painel do menu. */
export interface Convite {
  /** O código de 4 letras da sala. */
  codigo: string;
  /** O endereço em texto (sem `https://`), para ler em voz alta ou digitar. */
  endereco: string;
  /** O QR como imagem (data URL), só no telão; `null` no celular. */
  qr: string | null;
  /** O link completo, para compartilhar e copiar (só no celular); `null` no telão. */
  link: string | null;
}

/**
 * O link para um amigo entrar nesta sala, a partir do endereço desta página do controle (`href`): a mesma origem, a mesma página e só
 * `?sala=` e, se houver, o `?srv=` (o servidor da festa pela internet). Nada mais da URL vai junto (o token e o resto ficam de fora).
 */
export function linkParaEntrar(href: string, sala: string): string {
  const url = new URL(href);
  const params = new URLSearchParams();
  params.set("sala", sala);
  const srv = url.searchParams.get("srv");
  if (srv) params.set("srv", srv);
  return `${url.origin}${url.pathname}?${params.toString()}`;
}

/** O mesmo endereço sem o `https://`, para mostrar. */
export function enderecoParaMostrar(link: string): string {
  return link.replace(/^https?:\/\//, "");
}

/** O texto que o botão "Compartilhar" manda junto com o link. */
export function textoDoConvite(codigo: string): string {
  return `Entra na minha sala do Brasilero 3D! Código: ${codigo}`;
}
