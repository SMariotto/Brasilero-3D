// H3: tabela da velocidade do passe rasteiro, antes (H1: 6 + 0,9·d, de 8 a 16 m/s, bola com a desaceleração normal) e depois
// (H3: PASSE em constantes.ts, desaceleração reduzida no voo). Rode com: npm run tabela-passe -w @b3d/server
import { BOLA, PASSE } from "@b3d/core";

const DT = 1 / 60;

function voo(v0: number, d: number, fator: number): { t: number; vChegada: number } | null {
  let v = v0;
  let x = 0;
  let t = 0;
  while (t < 10) {
    const perda = (BOLA.atritoChao + BOLA.arrasto * v * v) * fator * DT;
    const v1 = v - perda;
    if (v1 < BOLA.velocidadeParada) return null; // parou antes
    const passo = ((v + v1) / 2) * DT;
    if (x + passo >= d) return { t: t + ((d - x) / passo) * DT, vChegada: v };
    x += passo;
    v = v1;
    t += DT;
  }
  return null;
}

const lim = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
console.log("distância | ANTES: saída  tempo  chegada | DEPOIS: saída  tempo  chegada | ganho de tempo");
for (const d of [6, 10, 15, 20, 25, 30]) {
  const v0a = lim(6 + 0.9 * d, 8, 16);
  const v0d = lim(PASSE.velocidadeBase + PASSE.velocidadePorMetro * d, PASSE.velocidadeMin, PASSE.velocidadeMax);
  const a = voo(v0a, d, 1);
  const p = voo(v0d, d, PASSE.desaceleracaoFator);
  const f = (r: { t: number; vChegada: number } | null, v0: number): string => (r ? `${v0.toFixed(1).padStart(5)} ${r.t.toFixed(2).padStart(5)}s ${r.vChegada.toFixed(1).padStart(5)}` : `${v0.toFixed(1).padStart(5)}  (não chega)`);
  const ganho = a && p ? `${(((a.t - p.t) / a.t) * 100).toFixed(0)}% mais rápido` : "-";
  console.log(`${String(d).padStart(8)} m |        ${f(a, v0a)}   |        ${f(p, v0d)}   | ${ganho}`);
}
