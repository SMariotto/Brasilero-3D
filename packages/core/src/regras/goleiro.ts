import { GOLEIRO } from "../constantes";
import { golMarcado, passoBola, type Bola } from "../fisica/bola";
import { limitar } from "../util/vetor";
import { escolherAlvoDoPasse, notaDoPasse, type Alvo, type Ponto } from "./acoes";
import { mover } from "./bots";
import type { Partida } from "./partida";
import type { JogadorPartida } from "./tipos-partida";

// Goleiro bot (SPEC 6.7): fica na linha entre a bola e o centro do gol, prevê o chute simulando a bola, mergulha depois de um atraso
// de reação, encaixa o que chega devagar (o domínio do goleiro cuida disso), espalma o que chega rápido e repõe a bola depois de 1,5 s.

const DT = 1 / 60;

/** Para onde a bola vai cruzar a linha do gol que este goleiro defende, se for entrar. */
function preverChute(p: Partida, g: JogadorPartida): { z: number; y: number } | null {
  const lado = g.vaga.time === 0 ? -1 : 1; // a Casa defende X negativo
  const copia: Bola = { ...p.bola };
  for (let i = 0; i < GOLEIRO.previsaoPassos; i++) {
    const xAntes = copia.x;
    passoBola(copia, p.campo, DT);
    if (golMarcado(copia, p.campo, xAntes) === lado) return { z: copia.z, y: copia.y };
  }
  return null;
}

/** Reposição de bola (SPEC 6.7): passe para o companheiro mais livre, ou chutão se ninguém estiver livre. */
function reporBola(p: Partida, g: JogadorPartida): void {
  const ataque = g.vaga.time === 0 ? 1 : -1;
  const alvos: Alvo[] = p
    .companheirosDe(g)
    .filter((o) => !p.noChao(o))
    .map((o) => ({ slot: o.vaga.slot, x: o.corpo.x, z: o.corpo.z, vx: o.corpo.vx, vz: o.corpo.vz }));
  const adversarios: Ponto[] = p.adversariosDe(g).map((o) => ({ x: o.corpo.x, z: o.corpo.z }));
  const de = { x: g.corpo.x, z: g.corpo.z };
  const alvo = escolherAlvoDoPasse({ de, dirX: ataque, dirZ: 0, companheiros: alvos, adversarios, alto: false, ataque, coneGraus: 160 });
  if (alvo && notaDoPasse(de, ataque, 0, alvo, adversarios, 160) >= 0.45) {
    const dx = alvo.x - de.x;
    const dz = alvo.z - de.z;
    const d = Math.hypot(dx, dz) || 1;
    p.passarComo(g, false, dx / d, dz / d, { cone: 40 });
  } else {
    p.chutarComo(g, 0.7, ataque, 0);
  }
}

export function atualizarGoleiro(p: Partida, g: JogadorPartida): void {
  const t = p.t;
  const campo = p.campo;
  const b = p.bola;
  const dif = p.config.dificuldade;
  const lado = g.vaga.time === 0 ? -1 : 1;
  const golX = lado * campo.metadeComp;

  if (g.mergulho || g.desliza || p.noChao(g)) return;

  // Com a bola na mão (ou cobrando tiro de meta): espera 1,5 s e repõe. Parado.
  if (p.temBola(g)) {
    g.cmd = { ...g.cmd, mag: 0, seguros: 0 };
    const desde = g.cerebro.segurandoDesde;
    const r = p.reinicio;
    const prontoEm = r && r.cobrador === g.vaga.slot ? r.prontoEm : null;
    const inicio = prontoEm ?? desde;
    if (inicio !== null && t - inicio >= GOLEIRO.esperaComBolaS) reporBola(p, g);
    return;
  }

  // Previsão do chute (a cada 2 passos, e só se a bola vem para o gol dele e está rápida)
  const vindo = b.vx * lado > 0 && Math.hypot(b.vx, b.vz) > 5;
  if (vindo && p.tick % 2 === 0) {
    const previsto = preverChute(p, g);
    // Ele mergulha até 2,2 m para o lado e o braço ainda alcança 1,25 m além: dá para defender chute até ~3,4 m do centro dele
    if (previsto && Math.abs(previsto.z - g.corpo.z) <= GOLEIRO.alcanceLateral + GOLEIRO.alcanceMergulhando && previsto.y <= GOLEIRO.alcanceAltura) {
      g.cerebro.detectadoEm ??= t;
      if (t - g.cerebro.detectadoEm >= GOLEIRO.reacaoS[dif]) {
        if (Math.abs(previsto.z - g.corpo.z) > 0.6) {
          p.mergulhar(g, limitar(previsto.z, g.corpo.z - GOLEIRO.alcanceLateral, g.corpo.z + GOLEIRO.alcanceLateral));
        }
        g.cerebro.detectadoEm = null;
        return;
      }
    } else if (previsto === null) {
      g.cerebro.detectadoEm = null;
    }
  } else if (!vindo) {
    g.cerebro.detectadoEm = null;
  }

  // Posição: sobre a linha entre a bola e o centro do gol, adiantado de 0,5 a 3 m conforme a distância da bola, dentro da área
  const dx = b.x - golX;
  const dz = b.z;
  const dist = Math.hypot(dx, dz) || 1;
  const adiantado = GOLEIRO.adiantadoMin + (GOLEIRO.adiantadoMax - GOLEIRO.adiantadoMin) * limitar(dist / 30, 0, 1);
  const folga = 0.5;
  const xMin = Math.min(golX, golX - lado * campo.areaProf) + folga;
  const xMax = Math.max(golX, golX - lado * campo.areaProf) - folga;
  const alvoX = limitar(golX + (dx / dist) * adiantado, xMin, xMax);
  const alvoZ = limitar((dz / dist) * adiantado, -campo.areaLarg / 2 + folga, campo.areaLarg / 2 - folga);
  mover(g, alvoX, alvoZ, false);

  // Parado, olha para a bola
  if (g.cmd.mag === 0) g.corpo.dir = Math.atan2(b.z - g.corpo.z, b.x - g.corpo.x);
}
