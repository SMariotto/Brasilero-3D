import { TIPO_CHUTE, type Evento } from "@b3d/core";

// O nome do chute que aparece no telão por 1 s (H2): "Trivela!", "Chapada!"... Só para os chutes com tipo; o chute reto de sempre não mostra nada.

const TEXTOS = {
  canudo: "Canudo!",
  chapada: "Chapada!",
  trivela: "Trivela!",
  cavadinha: "Cavadinha!",
} as const;

/** O texto do tipo de chute de um evento, ou `null` se não é um chute com tipo. */
export function textoDoChute(e: Evento): string | null {
  if (e.tipo !== "chute") return null;
  const tipo = e.dados.tipoDeChute;
  return tipo === undefined ? null : TEXTOS[tipo];
}

/** Por quantos milissegundos o texto fica na tela. */
export const DURACAO_DO_TEXTO_MS = TIPO_CHUTE.textoS * 1000;
