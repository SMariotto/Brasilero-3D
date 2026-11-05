import type { DonoDeSlot, VagaElenco } from "../protocolo/mensagens";

/**
 * Aplica a mensagem `donos` (G1) ao elenco que o aparelho guarda: cada jogador da lista passa a ter o humano no controle (com o
 * apelido dele); os outros voltam a ser bots, com o nome de bot. Devolve um elenco novo, sem mexer no que veio.
 */
export function aplicarDonos(elenco: readonly VagaElenco[], donos: readonly DonoDeSlot[]): VagaElenco[] {
  const porSlot = new Map(donos.map((d) => [d.slot, d]));
  return elenco.map((v) => {
    const dono = porSlot.get(v.slot);
    if (dono) return { ...v, humano: true, idControle: dono.id, nome: dono.nome };
    const { idControle: _id, ...resto } = v;
    return { ...resto, humano: false, nome: v.nomeBot ?? v.nome };
  });
}

/** Os donos de uma lista de elenco, na forma da mensagem `donos` (o inverso de `aplicarDonos`). */
export function donosDoElenco(elenco: readonly VagaElenco[]): DonoDeSlot[] {
  return elenco.filter((v) => v.humano && v.idControle !== undefined).map((v) => ({ slot: v.slot, id: v.idControle!, nome: v.nome }));
}
