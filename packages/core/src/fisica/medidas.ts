import { JOGADOR } from "../constantes";
import { novoCorpo, passoJogador, velocidade, type Corpo, type EntradaMovimento } from "./jogador";

// Medidas do movimento do jogador (H2): o quanto ele "desliza no sabão". Serve ao `npm run medir` e aos testes, que garantem que a
// velocidade máxima não mudou e que a frenagem e a mudança de direção continuam firmes.

const DT = 1 / 60;

export interface MedidaDeGiro {
  /** Segundos até a velocidade apontar para a nova direção (a menos de 10°) e voltar a 90% da máxima. */
  alinhaS: number;
  /** A menor velocidade (m/s) durante a curva: quanto o jogador "para" para virar. */
  velocidadeMinima: number;
  /** A maior velocidade lateral (m/s) em relação ao corpo: o pé deslizando de lado, em vez de correr para onde o corpo olha. */
  derrapagemMax: number;
  /** O caminho andado (m) até alinhar, além do que andaria em linha reta no mesmo tempo (o "raio" do giro). */
  desvioM: number;
}

export interface MedidasDeMovimento {
  /** Segundos de 0 a 90% da velocidade máxima, joystick cheio. */
  aceleracao90S: number;
  /** Velocidade máxima andando e na arrancada (m/s): não pode mudar. */
  velocidadeMaxima: number;
  velocidadeArrancada: number;
  /** Frenagem ao soltar o joystick na velocidade máxima. */
  freadaS: number;
  freadaM: number;
  /** Frenagem ao empurrar o joystick para trás (inversão). */
  giro45: MedidaDeGiro;
  giro90: MedidaDeGiro;
  giro180: MedidaDeGiro;
}

const entrada = (dx: number, dz: number, mag: number, correr = false): EntradaMovimento => ({ dx, dz, mag, correr, comBola: false });

function correrParado(c: Corpo, e: EntradaMovimento, segundos: number): void {
  for (let i = 0; i < segundos / DT; i++) passoJogador(c, e, DT);
}

function medirGiro(graus: number): MedidaDeGiro {
  const c = novoCorpo(0, 0, 0);
  correrParado(c, entrada(1, 0, 1), 2); // em velocidade máxima, indo para +X
  const a = (graus * Math.PI) / 180;
  const e = entrada(Math.cos(a), Math.sin(a), 1);
  const vmax = JOGADOR.velocidadeMax;
  let t = 0;
  let minima = velocidade(c);
  let derrapagem = 0;
  const x0 = c.x;
  const z0 = c.z;
  let alinhouEm = -1;
  for (let i = 0; i < 4 / DT; i++) {
    passoJogador(c, e, DT);
    t += DT;
    const v = velocidade(c);
    minima = Math.min(minima, v);
    // Velocidade lateral em relação ao corpo: componente de v perpendicular a (cos dir, sin dir)
    derrapagem = Math.max(derrapagem, Math.abs(-c.vx * Math.sin(c.dir) + c.vz * Math.cos(c.dir)));
    const ang = v > 0.05 ? Math.abs(Math.atan2(c.vz, c.vx) - a) : Math.PI;
    const dif = Math.min(ang, 2 * Math.PI - ang);
    if (alinhouEm < 0 && dif < (10 * Math.PI) / 180 && v >= 0.9 * vmax) {
      alinhouEm = t;
      break;
    }
  }
  const andou = Math.hypot(c.x - x0, c.z - z0);
  return { alinhaS: alinhouEm < 0 ? t : alinhouEm, velocidadeMinima: minima, derrapagemMax: derrapagem, desvioM: Math.max(0, vmax * t - andou) };
}

/** Mede aceleração, velocidade máxima, frenagem e mudança de direção com a física atual do jogador. */
export function medirMovimento(): MedidasDeMovimento {
  // Aceleração
  const c = novoCorpo(0, 0, 0);
  let aceleracao90S = 0;
  for (let i = 0; i < 5 / DT; i++) {
    passoJogador(c, entrada(1, 0, 1), DT);
    aceleracao90S += DT;
    if (velocidade(c) >= 0.9 * JOGADOR.velocidadeMax) break;
  }
  const vmax = novoCorpo(0, 0, 0);
  correrParado(vmax, entrada(1, 0, 1), 3);
  const arr = novoCorpo(0, 0, 0);
  correrParado(arr, entrada(1, 0, 1, true), 1.5);

  // Frenagem: solta o joystick na velocidade máxima
  const f = novoCorpo(0, 0, 0);
  correrParado(f, entrada(1, 0, 1), 2);
  const xf = f.x;
  let freadaS = 0;
  while (velocidade(f) > 0.05 && freadaS < 3) {
    passoJogador(f, entrada(1, 0, 0), DT);
    freadaS += DT;
  }

  return {
    aceleracao90S,
    velocidadeMaxima: velocidade(vmax),
    velocidadeArrancada: velocidade(arr),
    freadaS,
    freadaM: f.x - xf,
    giro45: medirGiro(45),
    giro90: medirGiro(90),
    giro180: medirGiro(180),
  };
}
