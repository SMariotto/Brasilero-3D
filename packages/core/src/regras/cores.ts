import { PARTIDA } from "../constantes";
import { acharTime, type CorRef, type PadraoCamisa, type Time, type Uniforme } from "../dados/index";

/** Hexadecimal de uma referência de cor do clube: `primaria`, `secundaria`, `terciaria` ou um `#RRGGBB` direto. */
export function corHex(time: Time, ref: CorRef): string {
  if (ref.startsWith("#")) return ref.toUpperCase();
  const cor = time.cores[ref as "primaria" | "secundaria" | "terciaria"];
  return (cor ?? time.cores.primaria).toUpperCase();
}

/** Um uniforme com todas as cores já em hexadecimal, pronto para pintar. */
export interface UniformeResolvido {
  padrao: PadraoCamisa;
  cor1: string;
  cor2: string;
  calcao: string;
  meiao: string;
}

const BRANCO = "#F2F2F2";
const PRETO = "#111111";

/** Camisa titular: cores e padrão do clube, calção e meião como o JSON manda. */
export function uniformeTitular(time: Time): UniformeResolvido {
  return {
    padrao: time.camisa.padrao,
    cor1: corHex(time, time.camisa.cor1),
    cor2: corHex(time, time.camisa.cor2),
    calcao: corHex(time, time.calcao),
    meiao: corHex(time, time.meiao),
  };
}

/** Camisa reserva: o JSON só traz a camisa; o calção usa a `cor2` dela e o meião a `cor1` (assim o conjunto combina). */
export function uniformeReserva(time: Time): UniformeResolvido {
  const u: Uniforme = time.reserva;
  return {
    padrao: u.padrao,
    cor1: corHex(time, u.cor1),
    cor2: corHex(time, u.cor2),
    calcao: corHex(time, u.cor2),
    meiao: corHex(time, u.cor1),
  };
}

// --- diferença de cor (ΔE em Lab) --------------------------------------------------------------

function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Hexadecimal `#RRGGBB` para Lab (iluminante D65). */
export function hexParaLab(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = linear((n >> 16) & 255);
  const g = linear((n >> 8) & 255);
  const b = linear(n & 255);
  // sRGB linear para XYZ (D65), já normalizado pelo branco de referência
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Diferença entre duas cores (ΔE76 em Lab): 0 é igual, acima de uns 25 dá para distinguir de longe. */
export function diferencaDeCor(a: string, b: string): number {
  const [l1, a1, b1] = hexParaLab(a);
  const [l2, a2, b2] = hexParaLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * Uniformes de cada time na partida: [Casa, Visitante] (SPEC 9.3).
 * A Casa sempre de titular. Se a camisa do Visitante parece com a da Casa (ΔE abaixo de 25), ele usa a reserva;
 * se a reserva também parece, usa branco ou preto, o que contrastar mais com a Casa.
 */
export function uniformesDaPartida(casaId: string, visitanteId: string): [UniformeResolvido, UniformeResolvido] {
  const casa = acharTime(casaId);
  const visitante = acharTime(visitanteId);
  const uCasa: UniformeResolvido = casa ? uniformeTitular(casa) : { padrao: "liso", cor1: "#C8102E", cor2: "#111111", calcao: BRANCO, meiao: "#C8102E" };
  if (!visitante) return [uCasa, { padrao: "liso", cor1: "#1B3F95", cor2: BRANCO, calcao: BRANCO, meiao: "#1B3F95" }];

  const limite = PARTIDA.conflitoCorDeltaE;
  const titular = uniformeTitular(visitante);
  if (diferencaDeCor(uCasa.cor1, titular.cor1) >= limite) return [uCasa, titular];

  const reserva = uniformeReserva(visitante);
  if (diferencaDeCor(uCasa.cor1, reserva.cor1) >= limite) return [uCasa, reserva];

  const contraste = diferencaDeCor(uCasa.cor1, BRANCO) >= diferencaDeCor(uCasa.cor1, PRETO) ? BRANCO : PRETO;
  return [uCasa, { padrao: "liso", cor1: contraste, cor2: contraste === BRANCO ? PRETO : BRANCO, calcao: contraste, meiao: contraste }];
}

/** Cor da camisa de cada time na partida: [Casa, Visitante]. */
export function coresDaPartida(casaId: string, visitanteId: string): [string, string] {
  const [a, b] = uniformesDaPartida(casaId, visitanteId);
  return [a.cor1, b.cor1];
}
