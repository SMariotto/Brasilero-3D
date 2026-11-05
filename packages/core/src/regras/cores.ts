import { acharTime, type CorRef, type Time, type Uniforme } from "../dados/index";

/** Hexadecimal de uma referência de cor do clube: `primaria`, `secundaria`, `terciaria` ou um `#RRGGBB` direto. */
export function corHex(time: Time, ref: CorRef): string {
  if (ref.startsWith("#")) return ref.toUpperCase();
  const cor = time.cores[ref as "primaria" | "secundaria" | "terciaria"];
  return (cor ?? time.cores.primaria).toUpperCase();
}

const corPrincipal = (time: Time, u: Uniforme): string => corHex(time, u.cor1);

/**
 * Cor da camisa de cada time na partida: [Casa, Visitante].
 * F2: se as duas camisas têm exatamente a mesma cor, o Visitante usa a camisa reserva. A regra completa (diferença de cor
 * ΔE em Lab, SPEC 9.3) entra na F5.
 */
export function coresDaPartida(casaId: string, visitanteId: string): [string, string] {
  const casa = acharTime(casaId);
  const visitante = acharTime(visitanteId);
  const corCasa = casa ? corPrincipal(casa, casa.camisa) : "#C8102E";
  if (!visitante) return [corCasa, "#1B3F95"];
  let corVisitante = corPrincipal(visitante, visitante.camisa);
  if (corVisitante === corCasa) corVisitante = corPrincipal(visitante, visitante.reserva);
  return [corCasa, corVisitante];
}
