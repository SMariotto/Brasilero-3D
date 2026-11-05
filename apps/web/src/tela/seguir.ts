import type { VagaElenco } from "@b3d/core";

// Câmera "segue meu jogador" (F8b): escolher quem seguir. Lógica pura, com teste.

/** Os slots dos jogadores humanos, na ordem do elenco. */
export function slotsHumanos(elenco: VagaElenco[]): number[] {
  return elenco.filter((v) => v.humano).map((v) => v.slot);
}

/** O próximo humano da lista depois de `atual` (volta ao primeiro no fim). Sem humanos devolve `null`. */
export function proximoSlot(humanos: number[], atual: number | null): number | null {
  if (humanos.length === 0) return null;
  const i = atual === null ? -1 : humanos.indexOf(atual);
  return humanos[(i + 1) % humanos.length] ?? null;
}

/** O humano com esse apelido (sem ligar para maiúscula e acento), para `?segue=Apelido` na URL. */
export function slotDoApelido(elenco: VagaElenco[], apelido: string): number | null {
  const limpar = (t: string): string =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  const alvo = limpar(apelido);
  if (alvo === "") return null;
  return elenco.find((v) => v.humano && limpar(v.nome) === alvo)?.slot ?? null;
}
