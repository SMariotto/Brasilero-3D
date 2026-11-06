// Taxa de gol de cada tipo de chute (H2): um atacante contra um goleiro de verdade, numa grade de posições do campo.
//   npm run chutes                                (3 sementes por posição, dificuldade média)
//   npm run chutes -- --sementes 6 --dificuldade dificil --marcador --mira centro
// Cada tipo é FORÇADO em todas as posições (para ver o que ele rende); a linha "auto" é o que o jogo faz de verdade (escolhe o tipo
// pelo lance). Zonas: "perto aberto" (até 20 m e abertura do gol de 26° ou mais), "ângulo médio" (18° a 26°), "fechado perto" (abaixo de 18°, até 20 m) e "longe" (mais de 20 m).
import { posicoesDeChute, simularChute, type ChuteSimulado, type Dificuldade, type TipoDeChute } from "@b3d/core";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const sementes = Number(arg("sementes") ?? 3);
const dificuldade = (arg("dificuldade") ?? "medio") as Dificuldade;
const marcador = process.argv.includes("--marcador");
const forca = Number(arg("forca") ?? 0.85);
const mira = (arg("mira") ?? "canto") as "canto" | "centro";

const PEDIDOS: Array<TipoDeChute | "auto"> = ["normal", "canudo", "chapada", "trivela", "cavadinha", "auto"];
const ZONAS: Array<[string, (c: ChuteSimulado) => boolean]> = [
  ["perto aberto", (c) => c.abertura >= 26 && c.distancia <= 20],
  ["ângulo médio", (c) => c.abertura >= 18 && c.abertura < 26 && c.distancia <= 20],
  ["fechado perto", (c) => c.abertura < 18 && c.distancia <= 20],
  ["longe", (c) => c.distancia > 20],
];

const posicoes = posicoesDeChute();
const todos: ChuteSimulado[] = [];
for (const pedido of PEDIDOS) {
  for (const { x, z } of posicoes) {
    for (let s = 0; s < sementes; s++) todos.push(simularChute(x, z, pedido, 100 + s * 37, { dificuldade, forca, marcador, mira }));
  }
}

const taxa = (l: ChuteSimulado[]): string => (l.length === 0 ? "-" : `${((100 * l.filter((c) => c.gol).length) / l.length).toFixed(0)}% (${l.length})`);
console.log(`Taxa de gol por tipo de chute: ${posicoes.length} posições x ${sementes} sementes, dificuldade ${dificuldade}, força ${forca}, mira no ${mira}${marcador ? ", com marcador" : ""}.\n`);
console.log(["tipo".padEnd(11), ...ZONAS.map(([n]) => n.padStart(16)), "geral".padStart(8)].join(" "));
for (const pedido of PEDIDOS) {
  // Cada tipo forçado só conta onde ele realmente saiu (a cavadinha só existe onde há trajetória possível)
  const l = todos.filter((c) => c.pedido === pedido && (pedido === "auto" || pedido === "normal" || c.tipo === pedido));
  console.log([(pedido === "auto" ? "AUTO" : pedido).padEnd(11), ...ZONAS.map(([, f]) => taxa(l.filter(f)).padStart(16)), taxa(l).padStart(8)].join(" "));
}
const auto = todos.filter((c) => c.pedido === "auto");
const cont = new Map<string, number>();
for (const c of auto) cont.set(c.tipo, (cont.get(c.tipo) ?? 0) + 1);
console.log(`\nO que o AUTO escolheu: ${[...cont].map(([t, n]) => `${t} ${((100 * n) / auto.length).toFixed(0)}%`).join(", ")}`);
console.log("\nO AUTO por zona e tipo escolhido (gols/chutes):");
for (const [nome, f] of ZONAS) {
  const z = auto.filter(f);
  const partes = [...new Set(z.map((c) => c.tipo))].map((t) => {
    const l = z.filter((c) => c.tipo === t);
    return `${t} ${l.filter((c) => c.gol).length}/${l.length}`;
  });
  console.log(`  ${nome.padEnd(13)} ${partes.join(", ")}`);
}
