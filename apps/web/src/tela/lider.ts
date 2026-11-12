import type { JogadorLobby } from "@b3d/core";

// Quem é o líder da sala e o que o telão mostra sobre isso (H7). Lógica pura, sem DOM, com teste.

/**
 * A sala está sem líder? Há celular conectado e nenhum deles é o líder (a vaga do líder venceu e o PC ainda não escolheu o novo; em
 * `MENU.liderAutoEscolheAposS` o servidor escolhe sozinho). Sala sem ninguém conectado não conta: o próximo que entrar vira o líder.
 */
export function salaSemLider(jogadores: readonly JogadorLobby[]): boolean {
  return jogadores.some((j) => j.conectado) && !jogadores.some((j) => j.dono);
}

/** O botão "Tornar líder" aparece só para o PC mestre, num celular conectado que ainda não é o líder (o servidor confere de novo). */
export function podeTornarLider(j: JogadorLobby, mestre: boolean): boolean {
  return mestre && j.conectado && !j.dono;
}

/**
 * O botão "Expulsar" aparece só para o PC mestre, e em qualquer controle da sala, inclusive o líder e quem está sem sinal (expulsar quem
 * está sem sinal libera a vaga sem esperar os 30 s). O servidor confere a permissão de novo.
 */
export function podeExpulsar(_j: JogadorLobby, mestre: boolean): boolean {
  return mestre;
}
