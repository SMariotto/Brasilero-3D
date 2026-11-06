import { GOLEIRO } from "../constantes";
import { golMarcado, passoBola, type Bola } from "../fisica/bola";
import { limitar } from "../util/vetor";
import { distanciaAoSegmento } from "./acoes";
import { mover } from "./bots";
import type { Partida } from "./partida";
import type { JogadorPartida } from "./tipos-partida";

// Goleiro bot (SPEC 6.7, refeito na H4): fica na linha entre a bola e o centro do gol, prevê o chute simulando a bola, mergulha depois
// de um atraso de reação e SEGURA o que chega devagar. Com a bola, protege do lado oposto ao adversário e distribui rápido: de mão
// (lançamento ao companheiro livre, ou longe e para o lado), de pé (passe rasteiro seguro ou chutão). A bola que o companheiro recua
// é só de pé: ele não mergulha nela nem pega com a mão. Sozinho com um atacante, sai da linha para fechar o ângulo.

const DT = 1 / 60;
const grau = Math.PI / 180;

/** Para onde a bola vai cruzar a linha do gol que este goleiro defende, se for entrar. */
function preverChute(p: Partida, g: JogadorPartida): { z: number; y: number; t: number } | null {
  const lado = g.vaga.time === 0 ? -1 : 1; // a Casa defende X negativo
  const copia: Bola = { ...p.bola };
  for (let i = 0; i < GOLEIRO.previsaoPassos; i++) {
    const xAntes = copia.x;
    passoBola(copia, p.campo, DT);
    if (golMarcado(copia, p.campo, xAntes) === lado) return { z: copia.z, y: copia.y, t: (i + 1) * DT };
  }
  return null;
}

function maisPerto(de: JogadorPartida, lista: JogadorPartida[]): { j: JogadorPartida; d: number } | null {
  let melhor: { j: JogadorPartida; d: number } | null = null;
  for (const o of lista) {
    if (o.vaga.goleiro) continue;
    const d = Math.hypot(o.corpo.x - de.corpo.x, o.corpo.z - de.corpo.z);
    if (!melhor || d < melhor.d) melhor = { j: o, d };
  }
  return melhor;
}

/** O companheiro está no meio, na frente do gol do próprio goleiro? Nunca se joga a bola para lá. */
function naFrenteDoProprioGol(p: Partida, g: JogadorPartida, o: JogadorPartida): boolean {
  const golX = (g.vaga.time === 0 ? -1 : 1) * p.campo.metadeComp;
  return Math.abs(o.corpo.z) < p.campo.areaLarg / 2 + 2 && Math.abs(o.corpo.x - golX) < p.campo.areaProf + 6;
}

/** Companheiros que servem de destino: em pé, longe o bastante do goleiro, com nenhum adversário colado e fora do meio na frente do gol. */
function candidatos(p: Partida, g: JogadorPartida, distMin: number, distMax: number): Array<{ o: JogadorPartida; d: number }> {
  const adversarios = p.adversariosDe(g);
  const lista: Array<{ o: JogadorPartida; d: number }> = [];
  for (const o of p.companheirosDe(g)) {
    if (o.vaga.goleiro || p.noChao(o)) continue;
    const d = Math.hypot(o.corpo.x - g.corpo.x, o.corpo.z - g.corpo.z);
    if (d < distMin || d > distMax) continue;
    if (naFrenteDoProprioGol(p, g, o)) continue;
    const livre = adversarios.every((a) => Math.hypot(a.corpo.x - o.corpo.x, a.corpo.z - o.corpo.z) >= GOLEIRO.lance.livreM);
    if (livre) lista.push({ o, d });
  }
  return lista.sort((a, b) => a.d - b.d);
}

/** Longe e para o lado: um ponto à frente, perto da linha lateral do lado oposto ao adversário mais próximo (nunca o meio na frente do gol). */
function alvoLonge(p: Partida, g: JogadorPartida): [number, number] {
  const ataque = g.vaga.time === 0 ? 1 : -1;
  const adv = maisPerto(g, p.adversariosDe(g));
  const lado = adv ? -Math.sign(adv.j.corpo.z - g.corpo.z) || 1 : g.corpo.z >= 0 ? 1 : -1;
  const tx = limitar(g.corpo.x + ataque * GOLEIRO.lance.longeM, -p.campo.metadeComp + 2, p.campo.metadeComp - 2);
  return [tx, lado * (p.campo.metadeLarg - GOLEIRO.lance.bordaM)];
}

/** De mão: lança por cima no companheiro livre mais próximo; sem ninguém livre, lança longe e para o lado. */
function lancarComAsMaos(p: Partida, g: JogadorPartida): void {
  const L = GOLEIRO.lance;
  const alvo = candidatos(p, g, L.distanciaMinM, L.distanciaMaxM)[0];
  if (alvo) p.lancarDoGoleiro(g, alvo.o.corpo.x, alvo.o.corpo.z, alvo.o);
  else {
    const [tx, tz] = alvoLonge(p, g);
    p.lancarDoGoleiro(g, tx, tz, null);
  }
}

/** De pé: passe rasteiro seguro (linha livre de adversários) ao companheiro livre mais próximo, ou chutão para longe. Nada de driblar. */
function jogarComOPe(p: Partida, g: JogadorPartida): void {
  const L = GOLEIRO.lance;
  const adversarios = p.adversariosDe(g);
  for (const { o } of candidatos(p, g, 6, 32)) {
    const linhaLivre = adversarios.every((a) => distanciaAoSegmento(a.corpo.x, a.corpo.z, g.corpo.x, g.corpo.z, o.corpo.x, o.corpo.z) >= L.passeLivreM);
    if (!linhaLivre) continue;
    const dx = o.corpo.x - g.corpo.x;
    const dz = o.corpo.z - g.corpo.z;
    const d = Math.hypot(dx, dz) || 1;
    p.passarComo(g, false, dx / d, dz / d, { cone: 40 });
    return;
  }
  const [tx, tz] = alvoLonge(p, g);
  const dx = tx - g.corpo.x;
  const dz = tz - g.corpo.z;
  const d = Math.hypot(dx, dz) || 1;
  p.chutarComo(g, 0.85, dx / d, dz / d);
}

/** Com a bola: vira o corpo para pôr a bola do lado oposto ao adversário mais perto e distribui no tempo certo. */
function comABola(p: Partida, g: JogadorPartida): void {
  const t = p.t;
  g.cmd = { ...g.cmd, mag: 0, seguros: 0 };
  const adv = maisPerto(g, p.adversariosDe(g));
  if (adv) {
    // A bola fica à frente do corpo (ponto de condução): de costas para o adversário, ela fica longe dele
    const alvoDir = Math.atan2(g.corpo.z - adv.j.corpo.z, g.corpo.x - adv.j.corpo.x);
    let dif = alvoDir - g.corpo.dir;
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    const passo = GOLEIRO.protegeGiroGraus * grau;
    g.corpo.dir += Math.max(-passo, Math.min(passo, dif));
  }

  const r = p.reinicio;
  const cobrando = r !== null && r.cobrador === g.vaga.slot;
  const inicio = (cobrando ? r.prontoEm : null) ?? g.cerebro.segurandoDesde;
  if (inicio === null) return;
  const maos = g.cerebro.maos && !cobrando;
  const decorrido = t - inicio;
  const pressionado = adv !== null && adv.d < GOLEIRO.pressaoM;
  if (decorrido >= (maos ? GOLEIRO.maosS : GOLEIRO.peS) || (pressionado && decorrido >= GOLEIRO.segurarMinS)) {
    if (maos) lancarComAsMaos(p, g);
    else jogarComOPe(p, g);
  }
}

/** Sozinho com um atacante que traz a bola? (nenhum companheiro do goleiro entre o atacante e o gol, nem colado nele) */
function atacanteSozinho(p: Partida, g: JogadorPartida): JogadorPartida | null {
  if (p.dominante === null) return null;
  const dono = p.jogador(p.dominante);
  if (!dono || dono.vaga.time === g.vaga.time || dono.vaga.goleiro) return null;
  const golX = (g.vaga.time === 0 ? -1 : 1) * p.campo.metadeComp;
  const dGol = Math.hypot(dono.corpo.x - golX, dono.corpo.z);
  if (dGol > GOLEIRO.saida.atacanteAteM) return null;
  for (const o of p.companheirosDe(g)) {
    if (o.vaga.goleiro || p.noChao(o)) continue;
    const entre = Math.abs(o.corpo.x - golX) < Math.abs(dono.corpo.x - golX) + 1.5 && Math.abs(o.corpo.z - dono.corpo.z) < 7;
    const colado = Math.hypot(o.corpo.x - dono.corpo.x, o.corpo.z - dono.corpo.z) < 4;
    if (entre || colado) return null;
  }
  return dono;
}

export function atualizarGoleiro(p: Partida, g: JogadorPartida): void {
  const t = p.t;
  const campo = p.campo;
  const b = p.bola;
  const dif = p.dificuldadeDe(g.vaga.time);
  const lado = g.vaga.time === 0 ? -1 : 1;
  const golX = lado * campo.metadeComp;

  if (g.mergulho || g.desliza || p.noChao(g)) return;

  if (p.temBola(g)) {
    comABola(p, g);
    return;
  }

  const recuada = p.bolaRecuadaPara(g);

  // Previsão do chute (a cada 2 passos, e só se a bola vem para o gol dele e está rápida). Bola recuada pelo companheiro: nada de mergulho.
  const vindo = !recuada && b.vx * lado > 0 && Math.hypot(b.vx, b.vz) > 5;
  if (vindo && p.tick % 2 === 0) {
    const previsto = preverChute(p, g);
    // Ele mergulha até 2,2 m para o lado e o braço ainda alcança 1,25 m além: dá para defender chute até ~3,4 m do centro dele
    if (previsto && Math.abs(previsto.z - g.corpo.z) <= GOLEIRO.alcanceLateral + GOLEIRO.alcanceMergulhando && previsto.y <= GOLEIRO.alcanceAltura) {
      g.cerebro.detectadoEm ??= t;
      // H4: o mergulho dura `mergulhoDuracaoS` e depois ele fica no chão; chute de longe demora a chegar, então ele espera para cair junto
      // com a bola (antes mergulhava logo ao ver o chute e já estava no chão quando a bola passava)
      if (t - g.cerebro.detectadoEm >= GOLEIRO.reacaoS[dif] && previsto.t <= GOLEIRO.mergulhoDuracaoS + GOLEIRO.mergulhoFolgaS) {
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

  const folga = 0.5;
  const xMin = Math.min(golX, golX - lado * campo.areaProf) + folga;
  const xMax = Math.max(golX, golX - lado * campo.areaProf) - folga;
  const zMax = campo.areaLarg / 2 - folga;

  // Bola recuada: ele se posiciona na linha da bola (de lado, sem sair do lugar) e a domina com o pé; bola devagar, vai até ela
  if (recuada) {
    const v = Math.hypot(b.vx, b.vz);
    if (v < 4) mover(g, limitar(b.x, xMin, xMax), limitar(b.z, -zMax, zMax));
    else if (b.vx * lado > 0) {
      const tChega = (g.corpo.x - b.x) / b.vx;
      mover(g, g.corpo.x, limitar(b.z + b.vz * Math.max(0, tChega), -zMax, zMax));
    } else mover(g, g.corpo.x, g.corpo.z);
    g.corpo.dir = Math.atan2(b.z - g.corpo.z, b.x - g.corpo.x);
    return;
  }

  // Posição: sobre a linha entre a bola e o centro do gol, adiantado de 0,5 a 3 m conforme a distância da bola, dentro da área.
  // H4: sozinho com um atacante, sai da linha para fechar o ângulo (moderado: `GOLEIRO.saida`).
  const dx = b.x - golX;
  const dz = b.z;
  const dist = Math.hypot(dx, dz) || 1;
  let adiantado = GOLEIRO.adiantadoMin + (GOLEIRO.adiantadoMax - GOLEIRO.adiantadoMin) * limitar(dist / 30, 0, 1);
  const sozinho = atacanteSozinho(p, g);
  if (sozinho) {
    const S = GOLEIRO.saida;
    const dAtacante = Math.hypot(sozinho.corpo.x - golX, sozinho.corpo.z);
    const k = limitar((S.atacanteAteM - dAtacante) / (S.atacanteAteM - S.cheioAteM), 0, 1);
    let saida = S.adiantadoMinM + (S.adiantadoMaxM - S.adiantadoMinM) * k;
    if (dAtacante < S.cheioAteM) saida = S.adiantadoPertoM + (S.adiantadoMaxM - S.adiantadoPertoM) * limitar((dAtacante - S.pertoAteM) / (S.cheioAteM - S.pertoAteM), 0, 1);
    adiantado = Math.max(adiantado, saida);
  }
  let alvoX = limitar(golX + (dx / dist) * adiantado, xMin, xMax);
  // Chute vindo: não recua (goleiro não anda de costas para o gol com a bola chegando)
  if (vindo && Math.abs(g.corpo.x - golX) > Math.abs(alvoX - golX)) alvoX = limitar(g.corpo.x, xMin, xMax);
  const alvoZ = limitar((dz / dist) * adiantado, -zMax, zMax);
  mover(g, alvoX, alvoZ);

  // Parado, olha para a bola
  if (g.cmd.mag === 0) g.corpo.dir = Math.atan2(b.z - g.corpo.z, b.x - g.corpo.x);
}
