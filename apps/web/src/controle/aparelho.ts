// O identificador do aparelho (H7.2). O celular sorteia um identificador na primeira vez, guarda no `localStorage` e manda no `ola` de toda
// entrada. É o que deixa o servidor bloquear um aparelho expulso até a sala fechar: não há conta de usuário, então o aparelho é só o
// navegador. Quem limpar os dados do navegador ou entrar por uma aba anônima ganha outro identificador e volta; para um grupo de amigos
// isso basta, e o PC vê quem entrou. O identificador nunca é mostrado a ninguém (o servidor não o manda em mensagem nenhuma).
// Lógica pura: o armazenamento e o sorteio entram por parâmetro, para testar sem navegador. Nunca importa nada de `src/tela/`.

export interface ArmazenamentoDoAparelho {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

export const CHAVE_DO_APARELHO = "b3d.aparelho";

/** 32 letras e números em hexadecimal, como o servidor espera (até 64 caracteres). */
const FORMATO = /^[0-9a-f]{32}$/;

/** Sorteia um identificador novo (16 bytes aleatórios em hexadecimal). */
export function sortearIdentificador(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * O identificador deste aparelho: o que está guardado (se tem o formato certo) ou um novo, que tenta guardar. Se o armazenamento falhar
 * (aba anônima, bloqueado), devolve um novo mesmo assim: vale enquanto a página não for recarregada.
 */
export function identificadorDoAparelho(local: ArmazenamentoDoAparelho | null, sortear: () => string = sortearIdentificador): string {
  try {
    const guardado = local?.getItem(CHAVE_DO_APARELHO);
    if (guardado && FORMATO.test(guardado)) return guardado;
  } catch {
    // armazenamento indisponível: segue com um novo
  }
  const novo = sortear();
  try {
    local?.setItem(CHAVE_DO_APARELHO, novo);
  } catch {
    // não deu para guardar: o identificador vale só nesta página
  }
  return novo;
}
