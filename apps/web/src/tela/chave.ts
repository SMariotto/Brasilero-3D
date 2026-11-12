// A chave do telão mestre (H7). Quem cria a sala recebe do servidor uma chave secreta no `bemvindo`; o navegador do PC a guarda, por
// código de sala, e a manda no `ola` de toda (re)conexão: assim recarregar a página (F5), fechar e abrir a aba, ou uma queda de rede não
// tiram o controle do PC. O armazenamento pode falhar (aba anônima, navegador sem espaço): tudo aqui é com try/catch e a função diz se
// conseguiu guardar. Lógica pura: o armazenamento entra por parâmetro, para testar sem navegador.

/** O que o `localStorage` e o `sessionStorage` têm em comum. */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

const nomeDaChave = (sala: string): string => `b3d.chave.${sala.trim().toUpperCase()}`;

/** A chave guardada para a sala, ou `null`. Procura na ordem dada (o `localStorage` primeiro, o `sessionStorage` de reserva). */
export function lerChave(sala: string, locais: readonly Armazenamento[]): string | null {
  for (const l of locais) {
    try {
      const v = l.getItem(nomeDaChave(sala));
      if (v) return v;
    } catch {
      // este armazenamento falhou: tenta o próximo
    }
  }
  return null;
}

/** Guarda a chave no primeiro armazenamento que aceitar. Devolve `false` se nenhum aceitou (o telão então só assiste depois de recarregar). */
export function guardarChave(sala: string, chave: string, locais: readonly Armazenamento[]): boolean {
  for (const l of locais) {
    try {
      l.setItem(nomeDaChave(sala), chave);
      return true;
    } catch {
      // cheio ou bloqueado: tenta o próximo
    }
  }
  return false;
}

/** Esquece a chave da sala em todos os armazenamentos (sala encerrada, ou a chave guardada não vale mais). */
export function esquecerChave(sala: string, locais: readonly Armazenamento[]): void {
  for (const l of locais) {
    try {
      l.removeItem(nomeDaChave(sala));
    } catch {
      // nada a fazer
    }
  }
}
