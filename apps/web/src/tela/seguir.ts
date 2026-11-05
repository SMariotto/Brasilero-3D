import type { VagaElenco } from "@b3d/core";

// Câmera "segue meu jogador" (F8b): escolher quem seguir. Lógica pura, com teste.
// G1: o humano muda de jogador durante a partida, então a câmera segue o HUMANO (pelo id do controle) e descobre o jogador dele a
// cada quadro.

/** Os ids dos humanos que estão jogando, em ordem crescente (a ordem não muda quando eles trocam de jogador). */
export function idsHumanos(elenco: VagaElenco[]): number[] {
  return elenco
    .filter((v) => v.humano && v.idControle !== undefined)
    .map((v) => v.idControle!)
    .sort((a, b) => a - b);
}

/** O próximo humano da lista depois de `atual` (volta ao primeiro no fim). Sem humanos devolve `null`. */
export function proximoId(ids: number[], atual: number | null): number | null {
  if (ids.length === 0) return null;
  const i = atual === null ? -1 : ids.indexOf(atual);
  return ids[(i + 1) % ids.length] ?? null;
}

/** O humano com esse apelido (sem ligar para maiúscula e acento), para `?segue=Apelido` na URL. */
export function idDoApelido(elenco: VagaElenco[], apelido: string): number | null {
  const limpar = (t: string): string =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const alvo = limpar(apelido);
  if (alvo === "") return null;
  return elenco.find((v) => v.humano && v.idControle !== undefined && limpar(v.nome) === alvo)?.idControle ?? null;
}

/** O jogador que esse humano controla agora, ou `null` (saiu, ou está sem jogador). */
export function slotDoHumano(elenco: VagaElenco[], id: number): number | null {
  return elenco.find((v) => v.humano && v.idControle === id)?.slot ?? null;
}
