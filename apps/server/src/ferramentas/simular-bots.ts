// Simulador de bots contra bots (G2): joga partidas inteiras sem rede e sem navegador, com semente fixa, e imprime por dificuldade
// o que os bots fazem: bote e carrinho tentados e bem-sucedidos, posse de bola, passes, chutes e gols por partida.
//   npm run simular                                        (6 cenários, 6 partidas de 8 min cada)
//   npm run simular -- --partidas 10 --seg 480 --semente 7
//   npm run simular -- --cenarios medio:medio,dificil:facil   (Casa:Visitante)
//   npm run simular -- --sem-humano                        (só bots contra bots)
// Cada linha é a média por partida. As colunas "C" são do time da Casa e as "V" do Visitante.
import { simularBots, simularDriblador, type Config, type Dificuldade, type ResultadoBots } from "@b3d/core";

const DIFICULDADES: Dificuldade[] = ["facil", "medio", "dificil"];

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const partidas = Number(arg("partidas") ?? 6);
const segundos = Number(arg("seg") ?? 480);
const sementeBase = Number(arg("semente") ?? 1);
const modo = (arg("modo") ?? "campo") as Config["modo"];
const n = Number(arg("n") ?? 5) as Config["n"];
const cenariosTexto = arg("cenarios") ?? "facil:facil,medio:medio,dificil:dificil,dificil:facil,dificil:medio,medio:facil";
const opcoes = { modo, n, segundos };

const fmt = (x: number, casas = 1): string => x.toFixed(casas);
const pad = (s: string, w: number): string => s.padStart(w);
const zero = (): [number, number] => [0, 0];

console.log(`Bots contra bots: ${partidas} partidas de ${segundos} s por cenário, modo ${modo}, ${n} de linha, semente base ${sementeBase}.`);
console.log("Valores por partida. C = Casa, V = Visitante. Acerto = desarmes por bote ou carrinho tentado.\n");
const cab = ["cenário (C:V)", "gols C", "gols V", "posse C%", "passes C", "passes V", "chutes C", "chutes V", "botes C", "botes V", "desarm C", "desarm V", "acerto C", "acerto V", "viradas", "faltas"];
const larguras = cab.map((c) => Math.max(c.length, 9));
console.log(cab.map((c, i) => pad(c, larguras[i]!)).join(" "));

for (const par of cenariosTexto.split(",")) {
  const [c, v] = par.split(":") as [Dificuldade, Dificuldade];
  if (!DIFICULDADES.includes(c) || !DIFICULDADES.includes(v)) throw new Error(`Cenário inválido: ${par}`);
  const soma: ResultadoBots = { gols: zero(), posseTicks: zero(), passes: zero(), chutes: zero(), botes: zero(), carrinhos: zero(), desarmesBote: zero(), desarmesCarrinho: zero(), viradas: 0, faltas: 0 };
  for (let i = 0; i < partidas; i++) {
    const r = simularBots(c, v, sementeBase + i * 7919, opcoes);
    for (const k of ["gols", "posseTicks", "passes", "chutes", "botes", "carrinhos", "desarmesBote", "desarmesCarrinho"] as const) {
      soma[k][0] += r[k][0];
      soma[k][1] += r[k][1];
    }
    soma.viradas += r.viradas;
    soma.faltas += r.faltas;
  }
  const m = (x: number): number => x / partidas;
  const posseTotal = soma.posseTicks[0] + soma.posseTicks[1] || 1;
  const desarmes = (tm: 0 | 1): number => soma.desarmesBote[tm] + soma.desarmesCarrinho[tm];
  const tentativas = (tm: 0 | 1): number => soma.botes[tm] + soma.carrinhos[tm];
  const acerto = (tm: 0 | 1): string => (tentativas(tm) > 0 ? `${fmt((100 * desarmes(tm)) / tentativas(tm), 0)}%` : "-");
  const linha = [
    par,
    fmt(m(soma.gols[0])),
    fmt(m(soma.gols[1])),
    fmt((100 * soma.posseTicks[0]) / posseTotal, 0),
    fmt(m(soma.passes[0])),
    fmt(m(soma.passes[1])),
    fmt(m(soma.chutes[0])),
    fmt(m(soma.chutes[1])),
    fmt(m(tentativas(0))),
    fmt(m(tentativas(1))),
    fmt(m(desarmes(0))),
    fmt(m(desarmes(1))),
    acerto(0),
    acerto(1),
    fmt(m(soma.viradas)),
    fmt(m(soma.faltas)),
  ];
  console.log(linha.map((x, i) => pad(x, larguras[i]!)).join(" "));
}

if (!process.argv.includes("--sem-humano")) {
  console.log(`\nDriblador humano de mentira (corre em zigue-zague, chuta de perto) contra bots, ${partidas} partidas de ${segundos} s:`);
  console.log("Por partida. 'perdas' = vezes que um bot tirou a bola dele (bote ou carrinho); 'posse' = segundos médios com a bola por posse.\n");
  const cab2 = ["dificuldade", "gols", "sofridos", "posses", "perdas", "bola (s)", "posse (s)", "perdas/min"];
  console.log(cab2.map((c) => pad(c, 11)).join(" "));
  for (const dif of DIFICULDADES) {
    const s = { gols: 0, sofridos: 0, desarmado: 0, comBolaS: 0, posses: 0 };
    for (let i = 0; i < partidas; i++) {
      const r = simularDriblador(dif, sementeBase + i * 7919, opcoes);
      s.gols += r.gols;
      s.sofridos += r.sofridos;
      s.desarmado += r.desarmado;
      s.comBolaS += r.comBolaS;
      s.posses += r.posses;
    }
    const m = (x: number): number => x / partidas;
    const linha = [dif, fmt(m(s.gols)), fmt(m(s.sofridos)), fmt(m(s.posses)), fmt(m(s.desarmado)), fmt(m(s.comBolaS), 0), s.posses > 0 ? fmt(s.comBolaS / s.posses) : "-", s.comBolaS > 0 ? fmt((s.desarmado * 60) / s.comBolaS) : "-"];
    console.log(linha.map((x) => pad(x, 11)).join(" "));
  }
}
