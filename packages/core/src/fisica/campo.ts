import { CAMPOS, type MedidasCampo } from "../constantes";
import type { Modo, NLinha } from "../protocolo/config";

/** Um pedaço reto de trave ou travessão (a bola colide com um cilindro em volta dele). */
export interface Segmento {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

/**
 * Geometria do campo (SPEC 4.3). Eixo X = comprimento (gol da Casa em X negativo), Z = largura, Y = altura.
 * O centro do campo é (0, 0, 0).
 */
export interface Campo extends MedidasCampo {
  n: NLinha;
  modo: Modo;
  /** Modo Arena: a bola quica nas paredes em volta (menos na boca do gol). */
  paredes: boolean;
  metadeComp: number;
  metadeLarg: number;
  /** Traves e travessões dos dois gols. */
  traves: Segmento[];
}

export function criarCampo(n: NLinha, modo: Modo): Campo {
  const m = CAMPOS[n];
  const metadeComp = m.comp / 2;
  const metadeGol = m.golLarg / 2;
  const traves: Segmento[] = [];
  for (const x of [-metadeComp, metadeComp]) {
    traves.push({ ax: x, ay: 0, az: -metadeGol, bx: x, by: m.golAlt, bz: -metadeGol });
    traves.push({ ax: x, ay: 0, az: metadeGol, bx: x, by: m.golAlt, bz: metadeGol });
    traves.push({ ax: x, ay: m.golAlt, az: -metadeGol, bx: x, by: m.golAlt, bz: metadeGol });
  }
  return { ...m, n, modo, paredes: modo === "arena", metadeComp, metadeLarg: m.larg / 2, traves };
}
