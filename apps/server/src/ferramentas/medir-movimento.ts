// Mede o movimento do jogador (H2): aceleração, frenagem sem comando e mudança de direção, e imprime uma tabela.
//   npm run medir
import { medirMovimento } from "@b3d/core";

const m = medirMovimento();
const f = (x: number, c = 2): string => x.toFixed(c);

console.log("Movimento do jogador (física atual), joystick cheio, sem bola:\n");
console.log(`aceleração de 0 a 90% da velocidade máxima : ${f(m.aceleracao90S)} s`);
console.log(`velocidade máxima andando / na arrancada   : ${f(m.velocidadeMaxima)} / ${f(m.velocidadeArrancada)} m/s`);
console.log(`frenagem ao soltar o joystick              : ${f(m.freadaS)} s e ${f(m.freadaM)} m até parar\n`);
console.log("Mudança de direção em velocidade máxima:");
console.log("  giro   alinha (s)   vel. mínima (m/s)   derrapagem máx. (m/s)   desvio (m)");
for (const [nome, g] of [["45°", m.giro45], ["90°", m.giro90], ["180°", m.giro180]] as const) {
  console.log(`  ${nome.padEnd(5)} ${f(g.alinhaS).padStart(10)} ${f(g.velocidadeMinima).padStart(19)} ${f(g.derrapagemMax).padStart(23)} ${f(g.desvioM).padStart(12)}`);
}
