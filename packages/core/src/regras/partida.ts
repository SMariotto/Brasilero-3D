import { ANIMACAO, BOLA, CHUTE, DOMINIO, JOGADOR, PARTIDA, TEMPO } from "../constantes";
import { criarCampo, type Campo } from "../fisica/campo";
import { golMarcado, novaBola, passoBola, type Bola } from "../fisica/bola";
import { colidirJogadores, limitarAoCampo, novoCorpo, passoJogador, velocidade, type Corpo } from "../fisica/jogador";
import {
  ACAO,
  ANIM,
  BOTAO,
  FASE,
  SEM_DOMINANTE,
  byteParaAngulo,
  comandoParado,
  type Comando,
  type JogadorSnap,
  type Snapshot,
} from "../protocolo/binario";
import type { Config } from "../protocolo/config";
import type { EventoJogo, Fim, GolFeito, VagaElenco } from "../protocolo/mensagens";
import { criarRng, type Rng } from "../util/rng";
import { calcularChute, calcularPasse } from "./acoes";

export type VagaPartida = VagaElenco;

export interface OpcoesPartida {
  /** A config que vale (na F2 o modo é sempre "arena"; `n` já é o efetivo). */
  config: Config;
  elenco: VagaPartida[];
  semente: number;
}

/** Um evento do jogo com o tick em que aconteceu. */
export type EventoDoTick = { tick: number } & EventoJogo;

interface Toque {
  slot: number;
  time: 0 | 1;
  t: number;
}

interface Botao {
  apertado: boolean;
  /** O jogador tinha a bola quando apertou? Só assim a ação ao soltar vale (PROTOCOLO 4). */
  comBola: boolean;
  desde: number;
}

interface JogadorPartida {
  vaga: VagaPartida;
  corpo: Corpo;
  cmd: Comando;
  chute: Botao;
  passe: Botao;
  /** `null` até o primeiro pacote: assim uma ação velha que chega na reconexão não dispara. */
  acaoSeq: number | null;
  /** Não pode dominar a bola até esta hora (depois de chutar ou passar). */
  bloqueioAte: number;
  proximoToque: number;
  animAte: number;
  anim: number;
}

const DT = 1 / TEMPO.tickHz;

/**
 * Uma partida (SPEC 4 e 6): campo, bola, jogadores, regras, relógio. É determinística: mesma semente e mesmos comandos
 * dão sempre o mesmo jogo. O servidor chama `passo()` 60 vezes por segundo e lê `snapshot()` e `eventosPendentes()`.
 * F2: só humanos (sem bots nem goleiros), modo Arena, passe rasteiro simples.
 */
export class Partida {
  readonly campo: Campo;
  readonly config: Config;
  readonly bola: Bola;
  readonly jogadores: JogadorPartida[];
  tick = 0;
  fase: number = FASE.preJogo;
  /** Segundos de jogo que faltam. */
  relogio: number;
  placar: [number, number] = [0, 0];
  /** Slot de quem domina a bola, ou `null`. */
  dominante: number | null = null;
  readonly gols: GolFeito[] = [];
  readonly assistenciasPorSlot = new Map<number, number>();
  /** Quem saiu jogando (e vai sair no próximo reinício). */
  saidaTime: 0 | 1 = 0;

  private readonly rng: Rng;
  private eventos: EventoDoTick[] = [];
  private faseAte: number;
  private ultimoToque: Toque | null = null;
  private penultimoToque: Toque | null = null;

  constructor(op: OpcoesPartida) {
    this.config = op.config;
    this.campo = criarCampo(op.config.n, op.config.modo);
    this.rng = criarRng(op.semente);
    this.bola = novaBola();
    this.relogio = op.config.duracao * 60;
    this.jogadores = op.elenco.map((vaga) => ({
      vaga,
      corpo: novoCorpo(0, 0, vaga.time === 0 ? 0 : Math.PI, vaga.goleiro),
      cmd: comandoParado(),
      chute: { apertado: false, comBola: false, desde: 0 },
      passe: { apertado: false, comBola: false, desde: 0 },
      acaoSeq: null,
      bloqueioAte: 0,
      proximoToque: 0,
      animAte: 0,
      anim: ANIM.parado,
    }));
    this.faseAte = PARTIDA.preJogoS;
    this.posicionarParaSaida();
  }

  /** Tempo de jogo em segundos desde o começo. */
  get t(): number {
    return this.tick * DT;
  }

  get terminou(): boolean {
    return this.fase === FASE.fim;
  }

  jogador(slot: number): JogadorPartida | undefined {
    return this.jogadores.find((j) => j.vaga.slot === slot);
  }

  /** Guarda o último comando de um controle. Vale a partir do próximo passo. */
  definirComando(slot: number, cmd: Comando): void {
    const j = this.jogador(slot);
    if (!j) return;
    j.cmd = cmd;
    if (j.acaoSeq === null) j.acaoSeq = cmd.acaoSeq; // primeiro pacote: não dispara ação antiga
  }

  /** Esvazia e devolve os eventos acumulados desde a última chamada. */
  eventosPendentes(): EventoDoTick[] {
    const e = this.eventos;
    this.eventos = [];
    return e;
  }

  // ---------------------------------------------------------------------------
  // Um passo de 1/60 s
  // ---------------------------------------------------------------------------

  passo(): void {
    this.tick++;
    const jogando = this.fase === FASE.jogo || this.fase === FASE.reinicio;

    if (jogando) for (const j of this.jogadores) this.processarComando(j);

    this.moverJogadores(jogando);
    if (jogando) this.atualizarDominio();
    else this.dominante = null;

    const xAntes = this.bola.x;
    const ev = passoBola(this.bola, this.campo, DT, { conduzida: this.dominante !== null });
    if (ev.trave && this.fase !== FASE.gol) this.evento({ tipo: "trave", dados: ev.trave });
    if (jogando) this.colidirCorpoComBola();

    if (jogando) {
      const lado = golMarcado(this.bola, this.campo, xAntes);
      if (lado !== 0) this.registrarGol(lado);
    }

    this.avancarFase();
  }

  // ---------------------------------------------------------------------------
  // Comandos do controle (PROTOCOLO 4)
  // ---------------------------------------------------------------------------

  private temBola(j: JogadorPartida): boolean {
    return this.dominante === j.vaga.slot;
  }

  private processarComando(j: JogadorPartida): void {
    const c = j.cmd;
    const chute = (c.seguros & BOTAO.chute) !== 0;
    const passe = (c.seguros & BOTAO.passe) !== 0;

    // Aperto: guarda se tinha a bola (sem a bola, CHUTE e PASSE viram carrinho e bote na F3).
    if (chute && !j.chute.apertado) j.chute = { apertado: true, comBola: this.temBola(j), desde: this.t };
    if (!chute) j.chute.apertado = false;
    if (passe && !j.passe.apertado) j.passe = { apertado: true, comBola: this.temBola(j), desde: this.t };
    if (!passe) j.passe.apertado = false;

    if (j.acaoSeq !== null && c.acaoSeq !== j.acaoSeq) {
      j.acaoSeq = c.acaoSeq;
      if (c.acao === ACAO.chute && j.chute.comBola && this.temBola(j)) {
        this.chutar(j, c.forca / 255);
        j.chute.comBola = false;
      } else if ((c.acao === ACAO.passeToque || c.acao === ACAO.passeSegurado) && j.passe.comBola && this.temBola(j)) {
        // F2: o lançamento por cima (passe segurado) ainda sai como passe rasteiro; entra na F3.
        this.passar(j);
        j.passe.comBola = false;
      }
    }
  }

  /** Direção do joystick, ou para onde o corpo olha se o joystick está solto. */
  private direcaoDe(j: JogadorPartida): [number, number] {
    if (j.cmd.mag > 0) {
      const a = byteParaAngulo(j.cmd.ang);
      return [Math.cos(a), -Math.sin(a)]; // PROTOCOLO 4: cima do celular = -Z
    }
    return [Math.cos(j.corpo.dir), Math.sin(j.corpo.dir)];
  }

  private chutar(j: JogadorPartida, forca: number): void {
    const [dirX, dirZ] = this.direcaoDe(j);
    const v = calcularChute({
      forca,
      dirX,
      dirZ,
      px: j.corpo.x,
      pz: j.corpo.z,
      time: j.vaga.time,
      campo: this.campo,
      arrancando: j.corpo.arrancando,
      rng: this.rng,
    });
    this.soltarBola(j, v.vx, v.vy, v.vz, ANIMACAO.chuteS, ANIM.chute);
    this.evento({ tipo: "chute", dados: { slot: j.vaga.slot, forca: Math.round(v.forca * 100) / 100 } });
  }

  private passar(j: JogadorPartida): void {
    const [dirX, dirZ] = this.direcaoDe(j);
    const v = calcularPasse(dirX, dirZ);
    this.soltarBola(j, v.vx, v.vy, v.vz, ANIMACAO.passeS, ANIM.passe);
    this.evento({ tipo: "passe", dados: { de: j.vaga.slot, alto: false } });
  }

  private soltarBola(j: JogadorPartida, vx: number, vy: number, vz: number, animS: number, anim: number): void {
    this.bola.vx = vx;
    this.bola.vy = vy;
    this.bola.vz = vz;
    this.dominante = null;
    j.bloqueioAte = this.t + DOMINIO.bloqueioAposChuteS;
    j.animAte = this.t + animS;
    j.anim = anim;
    this.registrarToque(j);
  }

  // ---------------------------------------------------------------------------
  // Movimento
  // ---------------------------------------------------------------------------

  private moverJogadores(jogando: boolean): void {
    for (const j of this.jogadores) {
      const c = j.cmd;
      const mag = jogando ? c.mag / 255 : 0;
      const a = byteParaAngulo(c.ang);
      passoJogador(
        j.corpo,
        {
          dx: Math.cos(a),
          dz: -Math.sin(a), // PROTOCOLO 4: direita do celular = +X, cima = -Z
          mag,
          correr: jogando && (c.seguros & BOTAO.correr) !== 0,
          comBola: this.temBola(j),
        },
        DT,
      );
    }
    colidirJogadores(this.jogadores.map((j) => j.corpo));
    for (const j of this.jogadores) limitarAoCampo(j.corpo, this.campo);
    if (this.fase === FASE.reinicio) this.restringirSaida();
  }

  /** Na saída de bola: cada um na sua metade e os adversários de quem cobra a pelo menos 4 m da bola (SPEC 4.5). */
  private restringirSaida(): void {
    for (const j of this.jogadores) {
      const c = j.corpo;
      const lado = j.vaga.time === 0 ? -1 : 1;
      // Casa fica em X negativo (lado = -1), Visitante em X positivo (lado = +1): lado · x tem que ser pelo menos o raio.
      if (lado * c.x < JOGADOR.raio) {
        c.x = lado * JOGADOR.raio;
        c.vx = 0;
      }
      if (j.vaga.time !== this.saidaTime) {
        const dx = c.x - this.bola.x;
        const dz = c.z - this.bola.z;
        const d = Math.hypot(dx, dz);
        const minimo = PARTIDA.distanciaAdversarioReinicioM;
        if (d < minimo) {
          const nx = d > 1e-6 ? dx / d : lado;
          const nz = d > 1e-6 ? dz / d : 0;
          c.x = this.bola.x + nx * minimo;
          c.z = this.bola.z + nz * minimo;
          limitarAoCampo(c, this.campo);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Domínio e condução (SPEC 6.3)
  // ---------------------------------------------------------------------------

  private alvoDeConducao(j: JogadorPartida): [number, number] {
    return [j.corpo.x + Math.cos(j.corpo.dir) * DOMINIO.alvoConducao, j.corpo.z + Math.sin(j.corpo.dir) * DOMINIO.alvoConducao];
  }

  private atualizarDominio(): void {
    const b = this.bola;
    let melhor: JogadorPartida | null = null;
    let melhorDist = Infinity;
    let atual: JogadorPartida | null = null;
    let atualDist = Infinity;

    for (const j of this.jogadores) {
      if (this.t < j.bloqueioAte) continue;
      const c = j.corpo;
      if (Math.hypot(b.x - c.x, b.z - c.z) > DOMINIO.alcance) continue;
      if (b.y > DOMINIO.alturaMax) continue;
      if (Math.hypot(b.vx - c.vx, b.vy, b.vz - c.vz) >= DOMINIO.velocidadeRelativaMax) continue;

      const [tx, tz] = this.alvoDeConducao(j);
      const d = Math.hypot(b.x - tx, b.z - tz);
      if (j.vaga.slot === this.dominante) {
        atual = j;
        atualDist = d;
      }
      if (d < melhorDist) {
        melhor = j;
        melhorDist = d;
      }
    }

    // Disputa: fica com quem está mais perto do alvo de condução; empate, fica com quem já tinha.
    let escolhido = melhor;
    if (atual && melhor !== atual && atualDist - melhorDist <= DOMINIO.disputaEmpateM) escolhido = atual;

    const novo = escolhido ? escolhido.vaga.slot : null;
    if (novo !== this.dominante && escolhido) this.registrarToque(escolhido);
    this.dominante = novo;

    if (!escolhido) return;

    // Mola com amortecimento em direção ao alvo, relativa à velocidade do jogador (a bola acompanha sem grudar).
    const c = escolhido.corpo;
    const [tx, tz] = this.alvoDeConducao(escolhido);
    b.vx += (DOMINIO.molaRigidez * (tx - b.x) - DOMINIO.molaAmortecimento * (b.vx - c.vx)) * DT;
    b.vz += (DOMINIO.molaRigidez * (tz - b.z) - DOMINIO.molaAmortecimento * (b.vz - c.vz)) * DT;

    // "Toque" de drible a cada 0,35 s enquanto corre, para a bola não parecer colada no pé.
    if (velocidade(c) > 1 && this.t >= escolhido.proximoToque) {
      b.vx += Math.cos(c.dir) * DOMINIO.toqueImpulso;
      b.vz += Math.sin(c.dir) * DOMINIO.toqueImpulso;
      escolhido.proximoToque = this.t + DOMINIO.toqueIntervaloS;
    }
  }

  /** Bola que o jogador não consegue dominar (rápida demais, ou ele acabou de chutar) bate no corpo dele. */
  private colidirCorpoComBola(): void {
    const b = this.bola;
    const alcance = JOGADOR.raio + BOLA.raio;
    for (const j of this.jogadores) {
      if (this.dominante === j.vaga.slot || this.t < j.bloqueioAte) continue;
      if (b.y > JOGADOR.alturaCorpo) continue;
      const c = j.corpo;
      const dx = b.x - c.x;
      const dz = b.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d >= alcance || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      b.x = c.x + nx * alcance;
      b.z = c.z + nz * alcance;
      const vn = (b.vx - c.vx) * nx + (b.vz - c.vz) * nz;
      if (vn < 0) {
        const k = (1 + JOGADOR.restituicaoCorpo) * vn;
        b.vx -= k * nx;
        b.vz -= k * nz;
        // Levou a bola no corpo: não consegue dominar o rebote na hora (senão não parece um bloqueio).
        j.bloqueioAte = Math.max(j.bloqueioAte, this.t + DOMINIO.bloqueioAposChuteS);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Toques, gols, fases
  // ---------------------------------------------------------------------------

  private registrarToque(j: JogadorPartida): void {
    const novo: Toque = { slot: j.vaga.slot, time: j.vaga.time, t: this.t };
    if (this.ultimoToque && this.ultimoToque.slot !== novo.slot) this.penultimoToque = this.ultimoToque;
    this.ultimoToque = novo;
  }

  private registrarGol(lado: 1 | -1): void {
    // Bola no gol de X positivo = a Casa marcou.
    const time: 0 | 1 = lado === 1 ? 0 : 1;
    this.placar[time]++;
    this.bola.naRede = lado;

    const quem = this.ultimoToque ?? { slot: this.jogadores.find((j) => j.vaga.time === time)?.vaga.slot ?? 0, time, t: this.t };
    const contra = quem.time !== time;
    let assistencia: number | undefined;
    const p = this.penultimoToque;
    if (!contra && p && p.time === time && p.slot !== quem.slot && this.t - p.t <= PARTIDA.assistenciaJanelaS) {
      assistencia = p.slot;
      this.assistenciasPorSlot.set(p.slot, (this.assistenciasPorSlot.get(p.slot) ?? 0) + 1);
    }

    this.gols.push({ slot: quem.slot, tick: this.tick, contra });
    this.dominante = null;
    this.fase = FASE.gol;
    this.faseAte = this.t + PARTIDA.golComemoracaoS;
    this.saidaTime = time === 0 ? 1 : 0; // quem sofreu o gol sai jogando
    this.evento({
      tipo: "gol",
      dados: {
        time,
        slot: quem.slot,
        ...(assistencia !== undefined ? { assistencia } : {}),
        contra,
        placar: [this.placar[0], this.placar[1]],
      },
    });
  }

  private avancarFase(): void {
    switch (this.fase) {
      case FASE.preJogo:
        if (this.t >= this.faseAte) {
          this.evento({ tipo: "apito", dados: { motivo: "inicio" } });
          this.entrarNaSaida();
        }
        return;
      case FASE.reinicio:
        // O jogo solta quando quem cobra toca na bola, ou depois de 3 s.
        if (this.dominante !== null || this.t >= this.faseAte) this.fase = FASE.jogo;
        return;
      case FASE.jogo:
        this.relogio = Math.max(0, this.relogio - DT);
        if (this.relogio <= 0) this.terminar();
        return;
      case FASE.gol:
        if (this.t >= this.faseAte) {
          this.posicionarParaSaida();
          this.evento({ tipo: "apito", dados: { motivo: "reinicio" } });
          this.entrarNaSaida();
        }
        return;
      default:
        return;
    }
  }

  private entrarNaSaida(): void {
    this.fase = FASE.reinicio;
    this.faseAte = this.t + PARTIDA.saidaSoltaAposS;
    this.evento({ tipo: "saida", dados: { time: this.saidaTime } });
  }

  private terminar(): void {
    this.fase = FASE.fim;
    this.dominante = null;
    this.evento({ tipo: "apito", dados: { motivo: "fim" } });
    this.evento({ tipo: "fim", dados: { placar: [this.placar[0], this.placar[1]] } });
  }

  /** Bola no centro e cada time na sua metade; quem cobra a saída começa perto da bola. */
  private posicionarParaSaida(): void {
    this.bola.x = 0;
    this.bola.y = BOLA.raio;
    this.bola.z = 0;
    this.bola.vx = this.bola.vy = this.bola.vz = 0;
    this.bola.naRede = 0;

    for (const time of [0, 1] as const) {
      const lado = time === 0 ? -1 : 1;
      const doTime = this.jogadores.filter((j) => j.vaga.time === time && !j.vaga.goleiro);
      const n = doTime.length;
      const abertura = Math.min(this.campo.metadeLarg * 0.7, 3 * Math.max(0, n - 1));
      doTime.forEach((j, i) => {
        const c = j.corpo;
        const cobra = time === this.saidaTime && i === 0;
        c.x = lado * (cobra ? 1.2 : this.campo.metadeComp * 0.45);
        c.z = cobra ? 0 : n <= 1 ? 0 : -abertura + (2 * abertura * (cobra ? 0 : i)) / (n - 1);
        c.vx = c.vz = 0;
        c.dir = time === 0 ? 0 : Math.PI;
        c.energia = JOGADOR.energiaMax;
        c.exausto = false;
        j.bloqueioAte = 0;
        j.chute = { apertado: false, comBola: false, desde: 0 };
        j.passe = { apertado: false, comBola: false, desde: 0 };
      });
    }
    this.dominante = null;
  }

  private evento(e: EventoJogo): void {
    this.eventos.push({ tick: this.tick, ...e });
  }

  // ---------------------------------------------------------------------------
  // Saída para o servidor
  // ---------------------------------------------------------------------------

  /** Quem fez a partida de cada slot: dados para o snapshot binário. */
  snapshot(): Snapshot {
    const jogadores: JogadorSnap[] = this.jogadores.map((j) => {
      const c = j.corpo;
      const v = velocidade(c);
      const carregando = j.chute.apertado && j.chute.comBola && this.dominante === j.vaga.slot;
      let anim: number = v > 0.3 ? ANIM.corrida : ANIM.parado;
      if (c.arrancando && v > 0.3) anim = ANIM.arrancada;
      if (this.t < j.animAte) anim = j.anim;
      if (this.fase === FASE.gol && j.vaga.time === (this.saidaTime === 0 ? 1 : 0)) anim = ANIM.comemoracao;
      return {
        slot: j.vaga.slot,
        x: c.x,
        z: c.z,
        dir: ((c.dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
        vel: v,
        anim,
        caido: false,
        arrancando: c.arrancando,
        comBola: this.dominante === j.vaga.slot,
        carregandoChute: carregando,
        humano: j.vaga.humano,
        carga: carregando ? Math.min(1, (this.t - j.chute.desde) / CHUTE.cargaTotalS) : 0,
      };
    });

    const b = this.bola;
    return {
      tick: this.tick,
      relogio: Math.round(this.relogio * 10),
      golsCasa: this.placar[0],
      golsVisitante: this.placar[1],
      fase: this.fase,
      dominante: this.dominante ?? SEM_DOMINANTE,
      bola: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz },
      jogadores,
    };
  }

  /** O que o celular de cada jogador precisa saber dele mesmo (mensagem `voce`). */
  estadoDe(slot: number): { comBola: boolean; energia: number } | null {
    const j = this.jogador(slot);
    if (!j) return null;
    return { comBola: this.dominante === slot, energia: Math.round(j.corpo.energia) };
  }

  /** Resumo do fim da partida (mensagem `fim`). */
  resumo(): Fim {
    const contar = (itens: number[]): { slot: number; quantidade: number } | null => {
      const por = new Map<number, number>();
      for (const s of itens) por.set(s, (por.get(s) ?? 0) + 1);
      let melhor: { slot: number; quantidade: number } | null = null;
      for (const [slot, quantidade] of por) if (!melhor || quantidade > melhor.quantidade) melhor = { slot, quantidade };
      return melhor;
    };
    const assist: number[] = [];
    for (const [slot, n] of this.assistenciasPorSlot) for (let i = 0; i < n; i++) assist.push(slot);
    return {
      t: "fim",
      placar: [this.placar[0], this.placar[1]],
      gols: this.gols.map((g) => ({ ...g })),
      destaques: {
        artilheiro: contar(this.gols.filter((g) => !g.contra).map((g) => g.slot)),
        assistencias: contar(assist),
        desarmes: null, // os desarmes (bote e carrinho) entram na F3
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Só para testes e para a rota de teste do servidor (NODE_ENV=test)
  // ---------------------------------------------------------------------------

  /** Põe um jogador e a bola onde o teste quer, a bola parada, e solta o jogo (fase "jogo"). */
  posicionarParaTeste(slot: number, x: number, z: number, bolaX: number, bolaZ: number, dir = 0): void {
    const j = this.jogador(slot);
    if (!j) return;
    j.corpo.x = x;
    j.corpo.z = z;
    j.corpo.vx = j.corpo.vz = 0;
    j.corpo.dir = dir;
    this.bola.x = bolaX;
    this.bola.y = BOLA.raio;
    this.bola.z = bolaZ;
    this.bola.vx = this.bola.vy = this.bola.vz = 0;
    this.bola.naRede = 0;
    this.dominante = null;
    this.fase = FASE.jogo;
  }
}
