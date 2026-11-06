import { BOT } from "../constantes";
import { inclinacaoParaFracao } from "../fisica/jogador";
import { anguloParaByte, magParaByte } from "../protocolo/binario";
import { limitar } from "../util/vetor";
import { escolherAlvoDoPasse, notaDoPasse, type Alvo, type Ponto } from "./acoes";
import type { Partida } from "./partida";
import { controladoPorBot, type JogadorPartida, type Reinicio } from "./tipos-partida";

// Bots de linha (SPEC 6.8): formação por N, estados (posicionar, pressionar, com a bola) e dificuldade.
// Os bots mandam comandos como um controle (direção, força, correr) e usam as mesmas funções de chute, passe e bote dos humanos.

interface PontoFormacao {
  /** Fração do comprimento do campo, contada a partir do gol do próprio time. */
  f: number;
  /** Fração da meia-largura, em Z. */
  z: number;
}

/** Formação por número de jogadores de linha (SPEC 6.8): N=3 zagueiro, meio, atacante; N=4 dois zagueiros; N=5 dois zagueiros e dois meios. */
const FORMACOES: Record<number, PontoFormacao[]> = {
  3: [
    { f: 0.2, z: 0 },
    { f: 0.45, z: -0.35 },
    { f: 0.7, z: 0.35 },
  ],
  4: [
    { f: 0.2, z: -0.4 },
    { f: 0.2, z: 0.4 },
    { f: 0.45, z: 0 },
    { f: 0.7, z: 0 },
  ],
  5: [
    { f: 0.2, z: -0.45 },
    { f: 0.2, z: 0.45 },
    { f: 0.42, z: -0.3 },
    { f: 0.42, z: 0.3 },
    { f: 0.68, z: 0 },
  ],
};

const ataqueDe = (time: 0 | 1): 1 | -1 => (time === 0 ? 1 : -1);

/** Posição de um ponto da formação, antes de deslocar pela bola. */
function pontoDaFormacao(p: Partida, time: 0 | 1, pf: PontoFormacao): { x: number; z: number } {
  const a = ataqueDe(time);
  return { x: a * (pf.f - 0.5) * p.campo.comp, z: pf.z * p.campo.metadeLarg };
}

/**
 * Onde cada jogador do time começa a saída de bola: a formação dentro da própria metade e o goleiro no gol.
 * Humanos também começam na formação (por ordem de slot), só que depois jogam livres.
 */
export function posicoesDeSaida(p: Partida, time: 0 | 1): Map<number, { x: number; z: number }> {
  const mapa = new Map<number, { x: number; z: number }>();
  const a = ataqueDe(time);
  const linha = p.jogadores.filter((j) => j.vaga.time === time && !j.vaga.goleiro).sort((x, y) => x.vaga.slot - y.vaga.slot);
  const formacao = FORMACOES[p.campo.n] ?? FORMACOES[5]!;

  linha.forEach((j, i) => {
    const pf = formacao[i % formacao.length]!;
    // Na saída cada um fica na própria metade: a profundidade da formação (0,2 a 0,7 do campo) é espremida de 0 a 1 entre o gol
    // e a beira do círculo central (2,5 m do meio), mantendo defesa, meio e ataque em linhas distintas.
    const profundidade = limitar(pf.f / 0.7, 0, 1);
    const metade = p.campo.metadeComp;
    const dentro = -a * (metade - profundidade * (metade - 2.5));
    mapa.set(j.vaga.slot, { x: dentro, z: pf.z * p.campo.metadeLarg });
  });

  const goleiro = p.jogadores.find((j) => j.vaga.time === time && j.vaga.goleiro);
  if (goleiro) mapa.set(goleiro.vaga.slot, { x: -a * (p.campo.metadeComp - 1.5), z: 0 });
  return mapa;
}

/**
 * Manda o jogador ir até (x, z) como se fosse um joystick: direção e inclinação. `fator` é a fração da velocidade máxima que ele usa
 * (a dificuldade); perto do destino ele desacelera. H3: não há CORRER, todo mundo corre sempre.
 */
export function mover(j: JogadorPartida, x: number, z: number, fator = 1): void {
  const dx = x - j.corpo.x;
  const dz = z - j.corpo.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.35) {
    j.cmd = { ...j.cmd, mag: 0, seguros: 0 };
    return;
  }
  j.cmd = { ...j.cmd, ang: anguloParaByte(Math.atan2(-dz, dx)), mag: magParaByte(inclinacaoParaFracao(Math.min(1, d / 1.5) * fator)), seguros: 0 };
}

function distanciaAoSegmento(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const c2 = dx * dx + dz * dz;
  const t = c2 > 0 ? limitar(((px - ax) * dx + (pz - az) * dz) / c2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export class Bots {
  private proximaDistribuicao = 0;

  constructor(private readonly p: Partida) {}

  /** Chamado a cada passo: distribui posições e papéis a cada ~0,1 s e deixa cada bot decidir no seu tempo de reação. */
  atualizar(): void {
    const p = this.p;
    if (p.tick >= this.proximaDistribuicao) {
      this.distribuir();
      this.proximaDistribuicao = p.tick + 6;
    }
    for (const j of p.jogadores) {
      if (j.vaga.goleiro || !controladoPorBot(j)) continue;
      this.atualizarBot(j);
    }
  }

  // --- posições e papéis ---------------------------------------------------

  /** Cada bot ocupa a posição da formação mais próxima que não é de humano; o bot mais perto da bola pressiona e o segundo fecha. */
  private distribuir(): void {
    const p = this.p;
    const b = p.bola;
    const formacao = FORMACOES[p.campo.n] ?? FORMACOES[5]!;

    for (const time of [0, 1] as const) {
      const linha = p.jogadores.filter((j) => j.vaga.time === time && !j.vaga.goleiro);
      const livres = formacao.map((pf) => pontoDaFormacao(p, time, pf)).map((q) => this.deslocar(q.x, q.z));
      const bots = linha.filter(controladoPorBot);
      const humanos = linha.filter((j) => !controladoPorBot(j));

      // Humanos "ocupam" a posição mais perto deles; sobra o resto para os bots
      for (const h of humanos) {
        let melhor = -1;
        let melhorD = Infinity;
        livres.forEach((q, i) => {
          const d = Math.hypot(q.x - h.corpo.x, q.z - h.corpo.z);
          if (d < melhorD) {
            melhorD = d;
            melhor = i;
          }
        });
        if (melhor >= 0) livres.splice(melhor, 1);
      }

      // Pares (bot, posição) pela menor distância
      const pares: { bot: JogadorPartida; i: number; d: number }[] = [];
      for (const bot of bots) livres.forEach((q, i) => pares.push({ bot, i, d: Math.hypot(q.x - bot.corpo.x, q.z - bot.corpo.z) }));
      pares.sort((a, c) => a.d - c.d);
      const usadosBot = new Set<JogadorPartida>();
      const usadosPos = new Set<number>();
      for (const par of pares) {
        if (usadosBot.has(par.bot) || usadosPos.has(par.i)) continue;
        usadosBot.add(par.bot);
        usadosPos.add(par.i);
        par.bot.cerebro.baseX = livres[par.i]!.x;
        par.bot.cerebro.baseZ = livres[par.i]!.z;
      }

      // Papéis: com a bola no time, todos apoiam; senão o bot mais perto da bola pressiona e o segundo fecha
      const timeComBola = p.dominante !== null && p.jogador(p.dominante)?.vaga.time === time;
      const humanoPerto = humanos.some((h) => Math.hypot(h.corpo.x - b.x, h.corpo.z - b.z) < 3);
      const porDistancia = [...bots].sort((x, y) => Math.hypot(x.corpo.x - b.x, x.corpo.z - b.z) - Math.hypot(y.corpo.x - b.x, y.corpo.z - b.z));
      for (const bot of bots) bot.cerebro.papel = "apoio";
      if (!timeComBola && !humanoPerto) {
        const quantos = BOT.pressionam[p.dificuldadeDe(time)];
        porDistancia.forEach((bot, i) => {
          if (i < quantos) bot.cerebro.papel = "pressionar";
          else if (i === quantos) bot.cerebro.papel = "fechar";
        });
      }
    }
  }

  /** Desloca a posição da formação para o lado da bola (SPEC 6.8) e mantém dentro do campo. */
  private deslocar(x: number, z: number): { x: number; z: number } {
    const p = this.p;
    const c = p.campo;
    return {
      x: limitar(x + 0.35 * p.bola.x, -c.metadeComp + 2, c.metadeComp - 2),
      z: limitar(z + 0.25 * p.bola.z, -c.metadeLarg + 2, c.metadeLarg - 2),
    };
  }

  // --- um bot ------------------------------------------------------------------

  private atualizarBot(j: JogadorPartida): void {
    const p = this.p;
    const c = j.cerebro;
    const dif = p.dificuldadeDe(j.vaga.time);

    if (p.noChao(j) || j.desliza || j.carrinho || j.bote) {
      j.cmd = { ...j.cmd, mag: 0, seguros: 0 };
      return;
    }

    const r = p.reinicio;
    if (r && r.cobrador === j.vaga.slot) {
      // Cobrador: espera um pouco (reação + espera de cobrança) e cobra
      j.cmd = { ...j.cmd, mag: 0, seguros: 0 };
      if (r.pronto && r.prontoEm !== null && p.t - r.prontoEm >= BOT.esperaCobrancaS + BOT.reacaoS[dif] && p.temBola(j)) this.cobrar(j, r);
      return;
    }

    if (p.t >= c.proximaDecisao) {
      this.decidir(j);
      c.proximaDecisao = p.t + BOT.reacaoS[dif] * (0.8 + 0.4 * p.rng.proximo());
    }
    mover(j, c.alvoX, c.alvoZ, BOT.velocidade[dif]);
  }

  private decidir(j: JogadorPartida): void {
    const p = this.p;
    const c = j.cerebro;
    const b = p.bola;
    const a = ataqueDe(j.vaga.time);
    const r = p.reinicio;
    const dif = p.dificuldadeDe(j.vaga.time);

    c.alvoX = c.baseX;
    c.alvoZ = c.baseZ;

    if (p.temBola(j)) {
      this.comABola(j);
      return;
    }

    // Saída de bola: o bot mais perto da bola, do time que cobra, vai buscá-la
    if (r?.tipo === "saida" && r.time === j.vaga.time && this.ehCobradorDaSaida(j)) {
      c.alvoX = b.x;
      c.alvoZ = b.z;
      return;
    }

    if (r) return; // outro reinício: quem não cobra espera na formação

    const dono = p.dominante !== null ? p.jogador(p.dominante) : undefined;
    const timeComBola = dono?.vaga.time === j.vaga.time;

    if (timeComBola) {
      // Apoio: os da frente avançam um pouco junto com a jogada
      c.alvoX = limitar(c.baseX + a * 4, -p.campo.metadeComp + 2, p.campo.metadeComp - 2);
      return;
    }

    if (c.papel === "pressionar") {
      // Intercepta a bola: mira onde ela vai estar quando o bot chegar (limitado pela antecipação da dificuldade)
      const distBola = Math.hypot(b.x - j.corpo.x, b.z - j.corpo.z);
      const tChegada = Math.min(BOT.antecipacaoS[dif], distBola / BOT.velocidadeParaInterceptar);
      c.alvoX = b.x + b.vx * tChegada;
      c.alvoZ = b.z + b.vz * tChegada;
      this.tentarBote(j, dono, 1);
    } else if (c.papel === "fechar") {
      this.tentarBote(j, dono, 0.8); // se o portador passar perto, aproveita
      // Fecha a linha de passe: fica entre a bola e o próprio gol, a uns 6 m da bola
      const gx = -a * p.campo.metadeComp;
      const dx = gx - b.x;
      const dz = 0 - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(1, 6 / d);
      c.alvoX = b.x + dx * k;
      c.alvoZ = b.z + dz * k;
    } else {
      this.tentarBote(j, dono, 0.7);
    }
  }

  /** Dá o bote no portador adversário se ele estiver ao alcance da dificuldade (`escala` encurta o alcance de quem não está pressionando). */
  private tentarBote(j: JogadorPartida, dono: JogadorPartida | undefined, escala: number): void {
    const p = this.p;
    if (!dono || dono.vaga.time === j.vaga.time || dono.vaga.goleiro) return;
    const dif = p.dificuldadeDe(j.vaga.time);
    const d = Math.hypot(dono.corpo.x - j.corpo.x, dono.corpo.z - j.corpo.z);
    if (d > BOT.alcanceBote[dif] * escala || p.t < j.boteProntoEm) return;
    if (p.rng.sorteio(BOT.chanceBote[dif])) p.iniciarBote(j, BOT.miraBoteS[dif]);
  }

  private ehCobradorDaSaida(j: JogadorPartida): boolean {
    const p = this.p;
    const b = p.bola;
    const doTime = p.jogadores.filter((o) => o.vaga.time === j.vaga.time && !o.vaga.goleiro && controladoPorBot(o));
    let melhor: JogadorPartida | undefined;
    let melhorD = Infinity;
    for (const o of doTime) {
      const d = Math.hypot(o.corpo.x - b.x, o.corpo.z - b.z);
      if (d < melhorD) {
        melhorD = d;
        melhor = o;
      }
    }
    // Se há humano no time, o humano é quem cobra
    const temHumano = p.jogadores.some((o) => o.vaga.time === j.vaga.time && !o.vaga.goleiro && !controladoPorBot(o));
    return !temHumano && melhor === j;
  }

  // --- com a bola ---------------------------------------------------------------

  private errar(time: 0 | 1): number {
    return this.p.rng.entre(-1, 1) * BOT.erroGraus[this.p.dificuldadeDe(time)];
  }

  /** Melhor companheiro para passar (cone largo dos bots) e a nota dele. */
  private melhorPasse(j: JogadorPartida, dirX: number, dirZ: number): { alvo: Alvo; nota: number } | null {
    const p = this.p;
    const alvos: Alvo[] = p
      .companheirosDe(j)
      .filter((o) => !p.noChao(o))
      .map((o) => ({ slot: o.vaga.slot, x: o.corpo.x, z: o.corpo.z, vx: o.corpo.vx, vz: o.corpo.vz }));
    const adversarios: Ponto[] = p.adversariosDe(j).map((o) => ({ x: o.corpo.x, z: o.corpo.z }));
    const alvo = escolherAlvoDoPasse({
      de: { x: j.corpo.x, z: j.corpo.z },
      dirX,
      dirZ,
      companheiros: alvos,
      adversarios,
      alto: false,
      ataque: ataqueDe(j.vaga.time),
      coneGraus: BOT.coneGraus,
    });
    if (!alvo) return null;
    return { alvo, nota: notaDoPasse({ x: j.corpo.x, z: j.corpo.z }, dirX, dirZ, alvo, adversarios, BOT.coneGraus) };
  }

  /** Ponto do gol adversário onde o bot mira: o canto longe do goleiro. */
  private alvoNoGol(j: JogadorPartida): { x: number; z: number } {
    const p = this.p;
    const a = ataqueDe(j.vaga.time);
    const goleiro = p.jogadores.find((o) => o.vaga.time !== j.vaga.time && o.vaga.goleiro);
    const lado = goleiro && goleiro.corpo.z >= 0 ? -1 : 1;
    return { x: a * p.campo.metadeComp, z: lado * (p.campo.golLarg / 2 - 0.7) };
  }

  private caminhoLivre(j: JogadorPartida, x: number, z: number): boolean {
    const p = this.p;
    for (const o of p.adversariosDe(j)) {
      if (o.vaga.goleiro) continue;
      if (distanciaAoSegmento(o.corpo.x, o.corpo.z, j.corpo.x, j.corpo.z, x, z) < 1.3) return false;
    }
    return true;
  }

  /** Com a bola: chuta se está perto do gol com o ângulo aberto, passa se tem adversário na frente, senão conduz para o gol. */
  private comABola(j: JogadorPartida): void {
    const p = this.p;
    const c = j.cerebro;
    const a = ataqueDe(j.vaga.time);
    const gol = this.alvoNoGol(j);
    const distGol = Math.hypot(gol.x - j.corpo.x, gol.z - j.corpo.z);

    if (distGol < BOT.chutaSeAMenosDe && this.caminhoLivre(j, gol.x, gol.z)) {
      const dx = gol.x - j.corpo.x;
      const dz = gol.z - j.corpo.z;
      const d = Math.hypot(dx, dz) || 1;
      p.chutarComo(j, 0.85 + 0.15 * p.rng.proximo(), dx / d, dz / d, this.errar(j.vaga.time));
      return;
    }

    // Adversário na frente (a menos de 2 m, dentro de ±50° da direção do gol)?
    const dirX = a;
    const dirZ = (gol.z - j.corpo.z) / Math.max(1, Math.abs(gol.x - j.corpo.x));
    const norma = Math.hypot(dirX, dirZ) || 1;
    let bloqueado = false;
    for (const o of p.adversariosDe(j)) {
      if (o.vaga.goleiro) continue;
      const ox = o.corpo.x - j.corpo.x;
      const oz = o.corpo.z - j.corpo.z;
      const od = Math.hypot(ox, oz);
      if (od < BOT.passaSeAdversarioAMenosDe && (ox * dirX + oz * dirZ) / (od * norma || 1) > Math.cos((50 * Math.PI) / 180)) bloqueado = true;
    }
    if (bloqueado) {
      const passe = this.melhorPasse(j, dirX / norma, dirZ / norma);
      if (passe && passe.nota >= BOT.notaMinimaPasse) {
        const dx = passe.alvo.x - j.corpo.x;
        const dz = passe.alvo.z - j.corpo.z;
        const d = Math.hypot(dx, dz) || 1;
        p.passarComo(j, false, dx / d, dz / d, { cone: 40, erroGraus: this.errar(j.vaga.time) });
        return;
      }
    }

    // Conduz para o gol
    c.alvoX = gol.x;
    c.alvoZ = j.corpo.z + (gol.z - j.corpo.z) * 0.5;
  }

  // --- cobranças -----------------------------------------------------------------

  /** Cobra o reinício: lateral e saída com passe, escanteio com cruzamento, falta com chute (se perto) ou passe. */
  private cobrar(j: JogadorPartida, r: Reinicio): void {
    const p = this.p;
    const a = ataqueDe(j.vaga.time);
    const gol = this.alvoNoGol(j);
    const erro = this.errar(j.vaga.time);

    if (r.tipo === "falta") {
      const dist = Math.hypot(gol.x - j.corpo.x, gol.z - j.corpo.z);
      if (dist < 22 && this.caminhoLivre(j, gol.x, gol.z)) {
        const dx = gol.x - j.corpo.x;
        const dz = gol.z - j.corpo.z;
        const d = Math.hypot(dx, dz) || 1;
        p.chutarComo(j, 0.9, dx / d, dz / d, erro);
        return;
      }
    }

    if (r.tipo === "escanteio") {
      // Cruzamento: lançamento em direção à área
      const px = Math.sign(j.corpo.x) * (p.campo.metadeComp - 6);
      const dx = px - j.corpo.x;
      const dz = 0 - j.corpo.z;
      const d = Math.hypot(dx, dz) || 1;
      p.passarComo(j, true, dx / d, dz / d, { cone: 100, erroGraus: erro });
      return;
    }

    // Passe para o melhor companheiro (cone largo); se não houver, chuta para a frente
    const dirX = a;
    const dirZ = -Math.sign(j.corpo.z) * 0.3;
    const passe = this.melhorPasse(j, dirX, dirZ);
    if (passe) {
      const dx = passe.alvo.x - j.corpo.x;
      const dz = passe.alvo.z - j.corpo.z;
      const d = Math.hypot(dx, dz) || 1;
      p.passarComo(j, false, dx / d, dz / d, { cone: 40, erroGraus: erro });
    } else {
      p.passarComo(j, false, dirX, dirZ, { cone: 140, erroGraus: erro });
    }
  }
}

