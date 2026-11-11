// Roubo de bola (H6): quanto o BOTE do humano rouba, e quantos roubos por minuto um defensor humano de mentira faz numa partida.
//   npm run roubo                                   (60 botes por célula, 6 partidas de 8 min, bots no Médio)
//   npm run roubo -- --botes 100 --partidas 10 --seg 480 --dificuldade facil --semente 3
// Parte 1: o portador corre a toda a velocidade (em reta ou em zigue-zague) e o defensor vem de frente, do lado ou por trás e aperta o
// bote quando chega a D m da bola (D é a distância ao centro da bola). Parte 2: o defensor numa partida inteira contra bots.
// Os bots não entram nos números da parte 1 (humano contra humano de mentira) e na parte 2 só jogam contra ele: o que muda aqui é
// o que a H6 mexe para o HUMANO (`FACILIDADE_DO_HUMANO.roubo`); o bote dos bots não muda.
import { simularBote, simularDefensor, type Dificuldade, type JeitoDeChegar } from "@b3d/core";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const botes = Number(arg("botes") ?? 60);
const partidas = Number(arg("partidas") ?? 6);
const segundos = Number(arg("seg") ?? 480);
const dificuldade = (arg("dificuldade") ?? "medio") as Dificuldade;
const sementeBase = Number(arg("semente") ?? 1);

const JEITOS: Array<[JeitoDeChegar, string]> = [
  ["frente", "de frente"],
  ["lado", "de lado"],
  ["tras", "por trás"],
];
const DISTANCIAS = [0.8, 1.2, 1.6, 2.0, 2.5, 3.0];

console.log(`Parte 1: % de botes que roubam a bola. Portador a toda a velocidade (6,84 m/s com a bola), defensor a 7,6 m/s, ${botes} botes por célula.`);
for (const zigue of [false, true]) {
  console.log(`\nportador ${zigue ? "em zigue-zague" : "em reta"}`);
  console.log("aperto a (m da bola)".padEnd(22), ...JEITOS.map(([, n]) => n.padStart(10)));
  for (const D of DISTANCIAS) {
    const col = JEITOS.map(([jeito]) => {
      let apertou = 0;
      let roubou = 0;
      for (let s = 0; s < botes; s++) {
        const r = simularBote(jeito, D, zigue, 10 + s * 17);
        if (r.apertou) apertou++;
        if (r.roubou) roubou++;
      }
      return (apertou === 0 ? "-" : `${((100 * roubou) / apertou).toFixed(0)}%`).padStart(10);
    });
    console.log(`${D.toFixed(1)} m`.padEnd(22), ...col);
  }
}

console.log(`\nParte 2: um defensor humano de mentira numa partida inteira (${partidas} partidas de ${segundos} s, bots no ${dificuldade}).`);
console.log("Ele corre para o portador adversário e aperta o bote a 1,8 m (ou o carrinho a 2,5 m). Por minuto de posse adversária:\n");
console.log("jeito".padEnd(10), "posse adv. (min)".padStart(18), "tentativas/min".padStart(16), "roubos/min".padStart(12), "% que roubam".padStart(14), "faltas/min".padStart(12));
for (const carrinho of [false, true]) {
  let posse = 0;
  let tentativas = 0;
  let roubos = 0;
  let faltas = 0;
  for (let i = 0; i < partidas; i++) {
    const r = simularDefensor(dificuldade, sementeBase + i * 7919, { segundos, carrinho });
    posse += r.posseAdversariaS;
    tentativas += r.tentativas;
    roubos += r.roubos;
    faltas += r.faltas;
  }
  const min = posse / 60 || 1;
  console.log(
    (carrinho ? "carrinho" : "bote").padEnd(10),
    (posse / 60 / partidas).toFixed(1).padStart(18),
    (tentativas / min).toFixed(2).padStart(16),
    (roubos / min).toFixed(2).padStart(12),
    (tentativas > 0 ? `${((100 * roubos) / tentativas).toFixed(0)}%` : "-").padStart(14),
    (faltas / min).toFixed(2).padStart(12),
  );
}
