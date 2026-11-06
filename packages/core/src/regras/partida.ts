import { ANIMACAO, BOLA, CHUTE, DEFESA, DOMINIO, GOLEIRO, JOGADOR, PARTIDA, PASSE, RECEPCAO, TEMPO, type Dificuldade } from "../constantes";
import { criarCampo, type Campo } from "../fisica/campo";
import { golMarcado, novaBola, passoBola, type Bola } from "../fisica/bola";
import { colidirJogadores, limitarAoCampo, novoCorpo, passoJogador, velocidade } from "../fisica/jogador";
import {
  ACAO,
  ANIM,
  BOTAO,
  FASE,
  SEM_DOMINANTE,
  byteParaAngulo,
  comandoParado,
  type JogadorSnap,
  type Snapshot,
  type Comando,
} from "../protocolo/binario";
import type { Config } from "../protocolo/config";
import type { DonoDeSlot, Destaque, EventoJogo, Fim, GolFeito, SituacaoJogador } from "../protocolo/mensagens";
import { criarRng, type Rng } from "../util/rng";
import { calcularChute, calcularPasseAssistido, escolherAlvoDoPasse, type Alvo, type EntradaPasse, type Ponto } from "./acoes";
import { Bots, posicoesDeSaida } from "./bots";
import { GestorDeControle } from "./controle";
import { completarElenco, nomeDeBot } from "./elenco";
import { atualizarGoleiro } from "./goleiro";
import {
  controladoPorBot,
  type CerebroEstado,
  type JogadorPartida,
  type Reinicio,
  type TipoReinicio,
  type VagaPartida,
} from "./tipos-partida";

export type { JogadorPartida, Reinicio, VagaPartida } from "./tipos-partida";

export interface OpcoesPartida {
  /** A config que vale (`n` já é o efetivo). */
  config: Config;
  /** Os humanos, cada um com a vaga que vai ocupar. Bots e goleiros são completados aqui. */
  elenco: VagaPartida[];
  semente: number;
  /** Só testes: não completa o elenco com bots nem goleiros (1 contra 1 puro, como na F2). */
  semBots?: boolean;
  /**
   * Controle estilo FIFA (G1): cada humano controla um jogador de cada vez e o controle passa para quem recebe o passe, para
   * o portador da bola ou para o companheiro mais perto dela. O servidor liga. Desligado (padrão), cada humano fica na vaga
   * em que começou, que é o que os testes antigos esperam.
   */
  controleFifa?: boolean;
  /** Só simulador e testes (G2): dificuldade dos bots de cada time [Casa, Visitante]. Padrão: a da config nos dois. */
  dificuldades?: [Dificuldade, Dificuldade];
}

/** O que cada jogador (humano ou bot) fez na partida, pelo NOME: o humano muda de jogador durante o jogo (G1). */
export interface Credito {
  chave: string;
  nome: string;
  /** O último jogador (slot) que ele controlou. */
  slot: number;
  time: 0 | 1;
  humano: boolean;
  gols: number;
  assistencias: number;
  desarmes: number;
}

/** Um evento do jogo com o tick em que aconteceu. */
export type EventoDoTick = { tick: number } & EventoJogo;

interface Toque {
  slot: number;
  time: 0 | 1;
  t: number;
  /** Quem era o jogador na hora do toque: o humano pode trocar de jogador antes do gol (G1), o crédito é de quem tocou. */
  nome: string;
  idControle?: number;
  humano: boolean;
}

const DT = 1 / TEMPO.tickHz;

const novoCerebro = (): CerebroEstado => ({
  proximaDecisao: 0,
  alvoX: 0,
  alvoZ: 0,
  correr: false,
  baseX: 0,
  baseZ: 0,
  papel: "apoio",
  detectadoEm: null,
  segurandoDesde: null,
});

/**
 * Uma partida (SPEC 4 e 6): campo, bola, jogadores, bots, regras, relógio. É determinística: mesma semente e mesmos comandos
 * dão sempre o mesmo jogo. O servidor chama `passo()` 60 vezes por segundo e lê `snapshot()` e `eventosPendentes()`.
 */
export class Partida {
  readonly campo: Campo;
  readonly config: Config;
  readonly bola: Bola;
  readonly jogadores: JogadorPartida[];
  readonly rng: Rng;
  tick = 0;
  fase: number = FASE.preJogo;
  /** Segundos de jogo que faltam. */
  relogio: number;
  placar: [number, number] = [0, 0];
  /** Slot de quem domina a bola, ou `null`. */
  dominante: number | null = null;
  readonly gols: GolFeito[] = [];
  readonly assistenciasPorSlot = new Map<number, number>();
  readonly desarmesPorSlot = new Map<number, number>();
  /** Quem sai jogando depois de um gol. */
  saidaTime: 0 | 1 = 0;
  /** Reinício em andamento (saída, lateral, escanteio, tiro de meta ou falta), ou `null` com a bola em jogo. */
  reinicio: Reinicio | null = null;

  private readonly porSlot = new Map<number, JogadorPartida>();
  private readonly bots: Bots;
  /** Quem controla qual jogador (G1). */
  readonly controle: GestorDeControle;
  /** Dificuldade dos bots de cada time (G2): normalmente a mesma da config nos dois. */
  readonly dificuldades: [Dificuldade, Dificuldade];
  /** Contagens para medir os bots (G2): quantas vezes cada time tentou bote e carrinho. */
  readonly metricas = { botesTentados: [0, 0], carrinhosTentados: [0, 0] };
  private readonly creditos = new Map<string, Credito>();
  private eventos: EventoDoTick[] = [];
  private faseAte: number;
  /** Está na prorrogação de gol de ouro (F8b). */
  emProrrogacao = false;
  /** O gol que acabou de sair decide a partida (gol de ouro): termina quando a comemoração acabar. */
  private fimAposGol = false;
  private ultimoToque: Toque | null = null;
  private penultimoToque: Toque | null = null;

  constructor(op: OpcoesPartida) {
    this.config = op.config;
    this.dificuldades = op.dificuldades ?? [op.config.dificuldade, op.config.dificuldade];
    this.campo = criarCampo(op.config.n, op.config.modo);
    this.rng = criarRng(op.semente);
    this.bola = novaBola();
    this.relogio = op.config.duracao * 60;

    const vagas = op.semBots ? op.elenco.map((v) => ({ ...v })) : completarElenco(op.elenco, op.config.n, this.rng);
    this.jogadores = vagas.map((vaga) => ({
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
      caidoAte: 0,
      carrinho: null,
      carrinhoProntoEm: 0,
      recepcaoAte: 0,
      recepcaoProntaEm: 0,
      bote: null,
      boteProntoEm: 0,
      mergulho: null,
      desliza: null,
      ausente: false,
      cerebro: novoCerebro(),
    }));
    for (const j of this.jogadores) this.porSlot.set(j.vaga.slot, j);

    // Todo jogador de linha tem um nome de bot, também as vagas em que um humano começa: o humano muda de jogador (G1) e o
    // que ele larga volta a ter nome de bot. Sorteio à parte, para não mexer na sequência do jogo.
    const rngNomes = criarRng(op.semente ^ 0x6e6f6d65);
    const usados = new Set<string>(this.jogadores.map((j) => j.vaga.nome));
    for (const j of this.jogadores) {
      if (j.vaga.goleiro) continue;
      j.vaga.nomeBot = j.vaga.humano ? nomeDeBot(rngNomes, usados) : j.vaga.nome;
    }
    this.controle = new GestorDeControle(this, op.controleFifa ?? false);
    for (const j of this.jogadores) if (j.vaga.humano) this.controle.registrarInicial(j);

    this.bots = new Bots(this);
    this.faseAte = PARTIDA.preJogoS;
    this.posicionarParaSaida();
  }

  /** A dificuldade dos bots deste time (G2). */
  dificuldadeDe(time: 0 | 1): Dificuldade {
    return this.dificuldades[time];
  }

  /** Tempo de jogo em segundos desde o começo. */
  get t(): number {
    return this.tick * DT;
  }

  get terminou(): boolean {
    return this.fase === FASE.fim;
  }

  /** O elenco atual, com os bots completados e as vagas que humanos assumiram. */
  get elenco(): VagaPartida[] {
    return this.jogadores.map((j) => j.vaga);
  }

  jogador(slot: number): JogadorPartida | undefined {
    return this.porSlot.get(slot);
  }

  temBola(j: JogadorPartida): boolean {
    return this.dominante === j.vaga.slot;
  }

  companheirosDe(j: JogadorPartida): JogadorPartida[] {
    return this.jogadores.filter((o) => o !== j && o.vaga.time === j.vaga.time);
  }

  adversariosDe(j: JogadorPartida): JogadorPartida[] {
    return this.jogadores.filter((o) => o.vaga.time !== j.vaga.time);
  }

  /** O jogador está no chão (caído ou deslizando no carrinho)? Não domina, não colide. */
  noChao(j: JogadorPartida): boolean {
    return j.caidoAte > this.t || j.carrinho !== null;
  }

  /** Guarda o último comando de quem controla o jogador `slot` (o humano que está nele agora). Vale a partir do próximo passo. */
  definirComando(slot: number, cmd: Comando): void {
    const j = this.jogador(slot);
    if (!j) return;
    const h = this.controle.humanoNoSlot(slot);
    if (h) {
      this.controle.comando(h.id, cmd);
      return;
    }
    j.cmd = cmd;
    if (j.acaoSeq === null) j.acaoSeq = cmd.acaoSeq; // primeiro pacote: não dispara ação antiga
  }

  /** O comando de um controle (G1): vale para o jogador que aquele humano controla agora, seja qual for. */
  definirComandoDoHumano(idControle: number, cmd: Comando): void {
    this.controle.comando(idControle, cmd);
  }

  /** O jogador que o controle `idControle` controla agora, ou `null` (sem jogador: caiu da conexão, ou não entrou). */
  slotDoHumano(idControle: number): number | null {
    return this.controle.slotDe(idControle);
  }

  /** Quem controla qual jogador agora (mensagem `donos`). */
  donos(): DonoDeSlot[] {
    return this.controle.donos();
  }

  /** Sobe toda vez que o controle muda de mãos. */
  get versaoControle(): number {
    return this.controle.versao;
  }

  /** Esvazia e devolve os eventos acumulados desde a última chamada. */
  eventosPendentes(): EventoDoTick[] {
    const e = this.eventos;
    this.eventos = [];
    return e;
  }

  // ---------------------------------------------------------------------------
  // Vagas (SPEC 4.1)
  // ---------------------------------------------------------------------------

  /**
   * Um humano que entrou com a partida rolando assume um bot do time (o mais perto da bola, no controle estilo FIFA). Devolve a
   * vaga, ou `null` se o time não tem bot livre (ou já tem 3 humanos).
   */
  promoverHumano(time: 0 | 1, nome: string, idControle: number): VagaPartida | null {
    const vaga = this.controle.adicionar(time, nome, idControle);
    if (vaga) this.registrarHumano(vaga.time, idControle, nome, vaga.slot);
    return vaga;
  }

  /** A vaga de um humano venceu (caiu de vez): o jogador que ele controlava vira bot. */
  removerHumano(idControle: number): void {
    this.controle.remover(idControle);
  }

  /** Humano sem conexão: um bot joga por ele até ele voltar (e, no controle estilo FIFA, ele sai da fila de trocas). */
  definirAusenteHumano(idControle: number, ausente: boolean): void {
    this.controle.definirAusente(idControle, ausente);
  }

  /** Como `removerHumano`, para quem só sabe o jogador (testes antigos). */
  liberarSlot(slot: number): void {
    const h = this.controle.humanoNoSlot(slot);
    if (h) this.controle.remover(h.id);
  }

  /** Como `definirAusenteHumano`, para quem só sabe o jogador (testes antigos). */
  definirAusente(slot: number, ausente: boolean): void {
    const h = this.controle.humanoNoSlot(slot);
    if (h) this.controle.definirAusente(h.id, ausente);
  }

  /** Cria (se não existir) o registro de estatísticas do humano, zerado, para ele aparecer no campeonato mesmo sem lance nenhum. */
  private registrarHumano(time: 0 | 1, id: number, nome: string, slot: number): void {
    const chave = `h${id}`;
    if (!this.creditos.has(chave)) this.creditos.set(chave, { chave, nome, slot, time, humano: true, gols: 0, assistencias: 0, desarmes: 0 });
  }

  /** O registro de estatísticas de quem controla o jogador `slot` agora (o humano, ou o bot daquele jogador). */
  private credito(slot: number): Credito | undefined {
    const j = this.jogador(slot);
    if (!j) return undefined;
    return this.creditoDe({ slot, time: j.vaga.time, nome: j.vaga.nome, humano: j.vaga.humano, ...(j.vaga.idControle !== undefined ? { idControle: j.vaga.idControle } : {}) });
  }

  /** O registro de estatísticas de quem tocou na bola (o humano pode ter trocado de jogador desde então). */
  private creditoDe(q: { slot: number; time: 0 | 1; nome: string; humano: boolean; idControle?: number }): Credito {
    const chave = q.humano && q.idControle !== undefined ? `h${q.idControle}` : `s${q.slot}`;
    let c = this.creditos.get(chave);
    if (!c) {
      c = { chave, nome: q.nome, slot: q.slot, time: q.time, humano: q.humano, gols: 0, assistencias: 0, desarmes: 0 };
      this.creditos.set(chave, c);
    }
    c.slot = q.slot;
    c.nome = q.nome;
    return c;
  }

  /** O que cada um fez na partida: todo humano (mesmo sem lance nenhum) e os bots que fizeram algo. Para o campeonato e o fim. */
  get estatisticas(): Credito[] {
    for (const j of this.jogadores) {
      if (j.vaga.humano && j.vaga.idControle !== undefined) this.registrarHumano(j.vaga.time, j.vaga.idControle, j.vaga.nome, j.vaga.slot);
    }
    return [...this.creditos.values()];
  }

  // ---------------------------------------------------------------------------
  // Um passo de 1/60 s
  // ---------------------------------------------------------------------------

  passo(): void {
    this.tick++;
    const jogando = this.fase === FASE.jogo || this.fase === FASE.reinicio;

    this.controle.atualizar();
    if (jogando) {
      this.bots.atualizar();
      for (const j of this.jogadores) if (j.vaga.goleiro) atualizarGoleiro(this, j);
      for (const j of this.jogadores) this.processarComando(j);
    }

    this.moverJogadores(jogando);
    if (jogando) {
      this.receberBola();
      this.atualizarDominio();
    }
    else this.dominante = null;

    const r = this.reinicio;
    const congelada = r !== null && r.tipo !== "saida" && !r.pronto;
    const xAntes = this.bola.x;
    if (congelada) {
      this.bola.vx = this.bola.vy = this.bola.vz = 0;
    } else {
      const ev = passoBola(this.bola, this.campo, DT, { conduzida: this.dominante !== null });
      if (ev.trave && this.fase !== FASE.gol) this.evento({ tipo: "trave", dados: ev.trave });
    }

    if (jogando) {
      this.colidirCorpoComBola();
      this.resolverDivisoes();
      this.resolverDefesas();
    }

    if (this.fase === FASE.jogo) {
      const lado = golMarcado(this.bola, this.campo, xAntes);
      if (lado !== 0) this.registrarGol(lado);
      else this.verificarSaidaDeBola();
    }

    this.avancarFase();
  }

  // ---------------------------------------------------------------------------
  // Comandos do controle (PROTOCOLO 4)
  // ---------------------------------------------------------------------------

  private processarComando(j: JogadorPartida): void {
    if (controladoPorBot(j)) return;
    const c = j.cmd;
    const chute = (c.seguros & BOTAO.chute) !== 0;
    const passe = (c.seguros & BOTAO.passe) !== 0;
    const podeAgir = !this.noChao(j) && j.desliza === null && j.bote === null && j.mergulho === null;

    // Aperto de CHUTE: voleio (prioridade), troca de jogador (sem a bola, G1) ou começa a carregar o chute (com a bola)
    if (chute && !j.chute.apertado) {
      j.chute = { apertado: true, comBola: this.temBola(j), desde: this.t };
      if (!this.temBola(j)) {
        if (podeAgir && this.bolaNoAlcanceDoVoleio(j)) {
          const [dx, dz] = this.direcaoDe(j);
          this.chutarComo(j, CHUTE.voleioForca, dx, dz);
          j.chute.comBola = false;
        } else if (this.reinicio?.cobrador !== j.vaga.slot) {
          this.controle.trocarManual(j.vaga.slot); // quem vai cobrar o reinício não troca
        }
      }
    }
    if (!chute) j.chute.apertado = false;

    // Aperto de PASSE sem a bola: bote. Se continuar segurando por 0,3 s sem a bola, vira carrinho (G1, provisório)
    if (passe && !j.passe.apertado) {
      j.passe = { apertado: true, comBola: this.temBola(j), desde: this.t };
      if (podeAgir && !this.temBola(j) && this.fase === FASE.jogo) this.iniciarBote(j);
    }
    if (!passe) {
      j.passe.apertado = false;
    } else if (!j.passe.comBola && !j.passe.longoFeito && this.t - j.passe.desde >= DEFESA.carrinho.segurarPasseS) {
      if (this.temBola(j)) {
        j.passe.longoFeito = true; // roubou a bola no bote: segurar agora é outra coisa (lançamento)
      } else if (podeAgir && this.fase === FASE.jogo) {
        j.passe.longoFeito = true;
        this.iniciarCarrinho(j);
      }
    }

    if (j.acaoSeq !== null && c.acaoSeq !== j.acaoSeq) {
      j.acaoSeq = c.acaoSeq;
      if (!podeAgir || !this.temBola(j)) return;
      const r = this.reinicio;
      const cobrando = r !== null && r.cobrador === j.vaga.slot;
      // Lateral e tiro de meta: só PASSE (CHUTE desligado). Escanteio e falta: os dois.
      const chuteLiberado = !cobrando || r?.tipo === "escanteio" || r?.tipo === "falta";
      if (c.acao === ACAO.chute && j.chute.comBola && chuteLiberado) {
        const [dx, dz] = this.direcaoDe(j);
        this.chutarComo(j, c.forca / 255, dx, dz);
        j.chute.comBola = false;
      } else if ((c.acao === ACAO.passeToque || c.acao === ACAO.passeSegurado) && j.passe.comBola) {
        const [dx, dz] = this.direcaoDe(j);
        this.passarComo(j, c.acao === ACAO.passeSegurado, dx, dz);
        j.passe.comBola = false;
      }
    }
  }

  /** Direção do joystick, ou para onde o corpo olha se o joystick está solto. */
  direcaoDe(j: JogadorPartida): [number, number] {
    if (j.cmd.mag > 0) {
      const a = byteParaAngulo(j.cmd.ang);
      return [Math.cos(a), -Math.sin(a)]; // PROTOCOLO 4: cima do celular = -Z
    }
    return [Math.cos(j.corpo.dir), Math.sin(j.corpo.dir)];
  }

  /** Bola ao alcance de um voleio ou cabeceio: a menos de 1 m na horizontal e entre 0,6 e 2,2 m de altura (SPEC 6.5). */
  private bolaNoAlcanceDoVoleio(j: JogadorPartida): boolean {
    const b = this.bola;
    return (
      b.naRede === 0 &&
      Math.hypot(b.x - j.corpo.x, b.z - j.corpo.z) < CHUTE.voleioAlcance &&
      b.y >= CHUTE.voleioAlturaMin &&
      b.y <= CHUTE.cabeceioAlturaMax
    );
  }

  /** Chute (SPEC 6.5). Os bots usam este mesmo caminho, com um erro extra por dificuldade. */
  chutarComo(j: JogadorPartida, forca: number, dirX: number, dirZ: number, erroExtraGraus = 0): void {
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
      erroExtraGraus,
    });
    this.soltarBola(j, v.vx, v.vy, v.vz, ANIMACAO.chuteS, ANIM.chute);
    this.evento({ tipo: "chute", dados: { slot: j.vaga.slot, forca: Math.round(v.forca * 100) / 100 } });
  }

  /** Passe (SPEC 6.4): rasteiro, ou lançamento por cima; mira no melhor companheiro do cone. */
  passarComo(j: JogadorPartida, alto: boolean, dirX: number, dirZ: number, opcoes: { cone?: number; erroGraus?: number } = {}): void {
    const v = calcularPasseAssistido(this.entradaDoPasse(j, alto, dirX, dirZ, opcoes));
    this.soltarBola(j, v.vx, v.vy, v.vz, ANIMACAO.passeS, ANIM.passe);
    this.evento({ tipo: "passe", dados: { de: j.vaga.slot, ...(v.para !== undefined ? { para: v.para } : {}), alto: v.alto } });
    this.controle.aoPassar(j.vaga.slot, v.para); // o controle vai para quem recebe (G1)
  }

  /**
   * Tudo que a escolha e a mira do passe precisam (H1). O passe do humano usa a ajuda da dificuldade (`PASSE.ajuda`: cone de busca
   * e força da mira) e, com o joystick solto, escolhe o companheiro mais à frente e livre. Bots e cobranças automáticas passam o
   * próprio cone e não levam a ajuda.
   */
  private entradaDoPasse(j: JogadorPartida, alto: boolean, dirX: number, dirZ: number, opcoes: { cone?: number; erroGraus?: number } = {}): EntradaPasse {
    const alvos: Alvo[] = this.companheirosDe(j)
      .filter((o) => !this.noChao(o))
      .map((o) => ({ slot: o.vaga.slot, x: o.corpo.x, z: o.corpo.z, vx: o.corpo.vx, vz: o.corpo.vz }));
    const adversarios: Ponto[] = this.adversariosDe(j).map((o) => ({ x: o.corpo.x, z: o.corpo.z }));
    const humano = !controladoPorBot(j) && opcoes.cone === undefined;
    const ajuda = PASSE.ajuda[this.dificuldadeDe(j.vaga.time)];
    return {
      de: { x: j.corpo.x, z: j.corpo.z },
      dirX,
      dirZ,
      companheiros: alvos,
      adversarios,
      alto,
      ataque: j.vaga.time === 0 ? 1 : -1,
      campo: { metadeComp: this.campo.metadeComp, metadeLarg: this.campo.metadeLarg },
      ...(opcoes.cone !== undefined ? { coneGraus: opcoes.cone } : {}),
      ...(opcoes.erroGraus !== undefined ? { erroGraus: opcoes.erroGraus } : {}),
      ...(humano ? { coneGraus: ajuda.coneGraus, forcaDaAjuda: ajuda.forca, semDirecao: j.cmd.mag === 0 } : {}),
    };
  }

  /**
   * Quem receberia o passe se o jogador o soltasse agora (H1), ou `null`: serve para mostrar a mira no telão e no celular enquanto
   * PASSE está apertado. `alto` é o lançamento (PASSE segurado por mais de `PASSE.lancamentoSegurarS`).
   */
  alvoDaMira(j: JogadorPartida, alto: boolean): number | null {
    const [dx, dz] = this.direcaoDe(j);
    return escolherAlvoDoPasse(this.entradaDoPasse(j, alto, dx, dz))?.slot ?? null;
  }

  private soltarBola(j: JogadorPartida, vx: number, vy: number, vz: number, animS: number, anim: number): void {
    this.bola.vx = vx;
    this.bola.vy = vy;
    this.bola.vz = vz;
    this.dominante = null;
    j.bloqueioAte = this.t + DOMINIO.bloqueioAposChuteS;
    j.animAte = this.t + animS;
    j.anim = anim;
    j.cerebro.segurandoDesde = null;
    this.registrarToque(j);
    // Quem cobrou o reinício coloca a bola em jogo.
    if (this.reinicio && (this.reinicio.cobrador === j.vaga.slot || this.reinicio.tipo === "saida")) this.soltarReinicio();
  }

  // ---------------------------------------------------------------------------
  // Defesa: bote e carrinho (SPEC 6.6)
  // ---------------------------------------------------------------------------

  /** Bote: avanço de 0,25 s a 9 m/s em direção à bola. Rouba se a bola ficar a menos de 0,8 m. Recarga de 0,8 s. */
  iniciarBote(j: JogadorPartida, miraS = 0): boolean {
    if (this.t < j.boteProntoEm || j.bote || this.noChao(j) || j.vaga.goleiro) return false;
    const b = this.bola;
    // `miraS` (bots, G2): mira onde a bola vai estar daqui a esses segundos, não onde ela está
    let dx = b.x + b.vx * miraS - j.corpo.x;
    let dz = b.z + b.vz * miraS - j.corpo.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || d > 6) {
      [dx, dz] = [Math.cos(j.corpo.dir), Math.sin(j.corpo.dir)];
    } else {
      dx /= d;
      dz /= d;
    }
    this.metricas.botesTentados[j.vaga.time]!++;
    j.bote = { ate: this.t + DEFESA.bote.duracaoS, dx, dz };
    j.boteProntoEm = this.t + DEFESA.bote.recargaS;
    j.corpo.dir = Math.atan2(dz, dx);
    return true;
  }

  /** Carrinho: deslize de 1 s começando a 9 m/s. Bola é arrancada a 8 m/s; adversário atingido antes da bola é falta. */
  iniciarCarrinho(j: JogadorPartida): boolean {
    if (this.t < j.carrinhoProntoEm || j.carrinho || j.bote || this.noChao(j) || j.vaga.goleiro) return false;
    const [dx, dz] = this.direcaoDe(j);
    this.metricas.carrinhosTentados[j.vaga.time]!++;
    j.carrinho = { desde: this.t, ate: this.t + DEFESA.carrinho.duracaoS, dx, dz, tocouBola: false };
    j.carrinhoProntoEm = this.t + DEFESA.carrinho.duracaoS + DEFESA.carrinho.recargaS;
    j.corpo.dir = Math.atan2(dz, dx);
    j.animAte = this.t + DEFESA.carrinho.duracaoS;
    j.anim = ANIM.carrinho;
    return true;
  }

  /** Efeitos do bote e do carrinho neste passo: roubar a bola, arrancar a bola, ou cometer falta. */
  private resolverDivisoes(): void {
    for (const j of this.jogadores) {
      if (j.bote) this.resolverBote(j);
      if (j.carrinho && this.fase === FASE.jogo) this.resolverCarrinho(j);
    }
  }

  private resolverBote(j: JogadorPartida): void {
    const dono = this.dominante !== null ? this.jogador(this.dominante) : undefined;
    if (!dono || dono.vaga.time === j.vaga.time || dono.vaga.goleiro) return;
    const b = this.bola;
    if (Math.hypot(b.x - j.corpo.x, b.z - j.corpo.z) >= DEFESA.bote.raioRoubo) return;
    // Roubou: a bola passa para ele e o antigo dono não retoma por um instante
    dono.bloqueioAte = this.t + DOMINIO.bloqueioAposChuteS;
    this.dominante = j.vaga.slot;
    j.bote = null;
    j.bloqueioAte = 0;
    this.registrarToque(j);
    this.desarmesPorSlot.set(j.vaga.slot, (this.desarmesPorSlot.get(j.vaga.slot) ?? 0) + 1);
    const cb = this.credito(j.vaga.slot);
    if (cb) cb.desarmes++;
    this.evento({ tipo: "roubo", dados: { slot: j.vaga.slot, de: dono.vaga.slot, jeito: "bote" } });
  }

  private resolverCarrinho(j: JogadorPartida): void {
    const c = j.carrinho!;
    const b = this.bola;
    const alcanceBola = JOGADOR.raio + BOLA.raio + 0.45;

    if (!c.tocouBola && b.y < DOMINIO.alturaMax && Math.hypot(b.x - j.corpo.x, b.z - j.corpo.z) < alcanceBola) {
      c.tocouBola = true;
      const dono = this.dominante !== null ? this.jogador(this.dominante) : undefined;
      if (dono && dono.vaga.time !== j.vaga.time) {
        dono.bloqueioAte = this.t + DOMINIO.bloqueioAposChuteS;
        this.desarmesPorSlot.set(j.vaga.slot, (this.desarmesPorSlot.get(j.vaga.slot) ?? 0) + 1);
        const cc = this.credito(j.vaga.slot);
        if (cc) cc.desarmes++;
        this.evento({ tipo: "roubo", dados: { slot: j.vaga.slot, de: dono.vaga.slot, jeito: "carrinho" } });
      }
      b.vx = c.dx * DEFESA.carrinho.velocidadeBola;
      b.vz = c.dz * DEFESA.carrinho.velocidadeBola;
      b.vy = 0;
      this.dominante = null;
      this.registrarToque(j);
      return;
    }

    if (c.tocouBola || !this.config.faltas) return;
    for (const o of this.adversariosDe(j)) {
      if (this.noChao(o)) continue;
      if (Math.hypot(o.corpo.x - j.corpo.x, o.corpo.z - j.corpo.z) < JOGADOR.raio * 2) {
        this.cometerFalta(j, o);
        return;
      }
    }
  }

  /** Carrinho que pegou o adversário antes da bola: ele cai por 1,2 s e o time dele cobra tiro livre (SPEC 4.6). */
  private cometerFalta(faltoso: JogadorPartida, vitima: JogadorPartida): void {
    const t = this.t;
    vitima.caidoAte = t + DEFESA.carrinho.quedaAdversarioS;
    vitima.corpo.vx = vitima.corpo.vz = 0;
    vitima.animAte = vitima.caidoAte;
    vitima.anim = ANIM.queda;
    if (this.dominante === vitima.vaga.slot) this.dominante = null;
    faltoso.carrinho = null;
    faltoso.caidoAte = t + DEFESA.carrinho.chaoAposS;
    faltoso.corpo.vx = faltoso.corpo.vz = 0;

    const x = vitima.corpo.x;
    const z = vitima.corpo.z;
    this.evento({ tipo: "falta", dados: { de: faltoso.vaga.slot, em: vitima.vaga.slot, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 } });
    this.evento({ tipo: "apito", dados: { motivo: "falta" } });

    // Dentro da área do próprio time, o tiro livre sai da linha da área (sem pênalti na v1).
    const [px, pz] = this.posicaoDaFalta(x, z, faltoso.vaga.time);
    this.iniciarReinicio("falta", vitima.vaga.time, px, pz, vitima.vaga.slot);
  }

  private posicaoDaFalta(x: number, z: number, timeFaltoso: 0 | 1): [number, number] {
    const c = this.campo;
    const lado = timeFaltoso === 0 ? -1 : 1; // a Casa defende X negativo
    const dentro = lado * x > c.metadeComp - c.areaProf && Math.abs(z) < c.areaLarg / 2;
    const px = dentro ? lado * (c.metadeComp - c.areaProf) : x;
    return [Math.max(-c.metadeComp + 1, Math.min(c.metadeComp - 1, px)), Math.max(-c.metadeLarg + 1, Math.min(c.metadeLarg - 1, z))];
  }

  // ---------------------------------------------------------------------------
  // Defesa do goleiro (SPEC 6.7)
  // ---------------------------------------------------------------------------

  /** Mergulho: o goleiro anda de lado até `zAlvo` em 0,45 s. Quem decide mergulhar é o `goleiro.ts`. */
  mergulhar(g: JogadorPartida, zAlvo: number): void {
    if (g.mergulho || this.noChao(g)) return;
    g.mergulho = { ate: this.t + GOLEIRO.mergulhoDuracaoS, z0: g.corpo.z, zAlvo, desde: this.t };
    g.animAte = g.mergulho.ate;
    g.anim = zAlvo < g.corpo.z ? ANIM.goleiroMergulhoEsq : ANIM.goleiroMergulhoDir;
  }

  /** Bola rápida (acima de 18 m/s) ao alcance do goleiro: espalma para o lado, a menos que ele falhe (chance pela dificuldade). */
  private resolverDefesas(): void {
    const b = this.bola;
    if (b.naRede !== 0 || this.dominante !== null) return;
    for (const g of this.jogadores) {
      if (!g.vaga.goleiro || this.t < g.bloqueioAte) continue;
      if (this.noChao(g) && !g.mergulho) continue;
      const alcance = g.mergulho ? GOLEIRO.alcanceMergulhando : GOLEIRO.alcanceEmPe;
      const altura = g.mergulho ? 2.4 : GOLEIRO.alturaEmPe;
      if (b.y > altura || Math.hypot(b.x - g.corpo.x, b.z - g.corpo.z) > alcance) continue;
      const rel = Math.hypot(b.vx - g.corpo.vx, b.vy, b.vz - g.corpo.vz);
      if (rel < GOLEIRO.encaixaAteVelocidade) continue; // devagar: ele encaixa pelo domínio normal

      g.bloqueioAte = this.t + GOLEIRO.bloqueioAposEspalmarS;
      if (this.rng.sorteio(GOLEIRO.falhaChance[this.dificuldadeDe(g.vaga.time)])) continue; // falhou: a bola segue
      const lado = b.z >= g.corpo.z ? 1 : -1;
      b.vx = -b.vx * GOLEIRO.espalmaFator;
      b.vz = lado * GOLEIRO.espalmaLateral;
      b.vy = Math.max(2, b.vy * 0.5);
      this.registrarToque(g);
      this.evento({ tipo: "defesa", dados: { slot: g.vaga.slot, encaixou: false } });
    }
  }

  // ---------------------------------------------------------------------------
  // Movimento
  // ---------------------------------------------------------------------------

  private moverJogadores(jogando: boolean): void {
    const t = this.t;
    for (const j of this.jogadores) {
      const c = j.cmd;
      const corpo = j.corpo;

      if (j.desliza) {
        const d = j.desliza;
        const k = Math.min(1, (t - d.desde) / d.duracao);
        corpo.x = d.x0 + (d.x1 - d.x0) * k;
        corpo.z = d.z0 + (d.z1 - d.z0) * k;
        corpo.vx = corpo.vz = 0;
        if (k >= 1) this.cobradorChegou(j);
        continue;
      }

      if (j.carrinho) {
        const k = Math.min(1, (t - j.carrinho.desde) / DEFESA.carrinho.duracaoS);
        const v = DEFESA.carrinho.velocidadeInicial * (1 - k);
        corpo.vx = j.carrinho.dx * v;
        corpo.vz = j.carrinho.dz * v;
        corpo.x += corpo.vx * DT;
        corpo.z += corpo.vz * DT;
        corpo.arrancando = false;
        if (t >= j.carrinho.ate) {
          j.carrinho = null;
          corpo.vx = corpo.vz = 0;
          j.caidoAte = t + DEFESA.carrinho.chaoAposS; // fica no chão 0,8 s depois do deslize
          j.anim = ANIM.queda;
          j.animAte = j.caidoAte;
        }
        continue;
      }

      if (j.bote) {
        corpo.vx = j.bote.dx * DEFESA.bote.velocidade;
        corpo.vz = j.bote.dz * DEFESA.bote.velocidade;
        corpo.x += corpo.vx * DT;
        corpo.z += corpo.vz * DT;
        if (t >= j.bote.ate) {
          j.bote = null;
          corpo.vx = corpo.vz = 0;
        }
        continue;
      }

      if (j.mergulho) {
        const m = j.mergulho;
        const dz = m.zAlvo - corpo.z;
        const passo = GOLEIRO.mergulhoVelocidade * DT;
        corpo.vz = Math.abs(dz) > passo ? Math.sign(dz) * GOLEIRO.mergulhoVelocidade : 0;
        corpo.z += Math.abs(dz) > passo ? Math.sign(dz) * passo : dz;
        corpo.vx = 0;
        if (t >= m.ate) {
          j.mergulho = null;
          corpo.vz = 0;
          j.caidoAte = t + 0.4; // levanta
          j.anim = ANIM.parado;
        }
        continue;
      }

      const r = this.reinicio;
      const parado = !jogando || this.noChao(j) || (r !== null && r.cobrador === j.vaga.slot && r.pronto);
      const a = byteParaAngulo(c.ang);
      passoJogador(
        corpo,
        {
          dx: Math.cos(a),
          dz: -Math.sin(a), // PROTOCOLO 4: direita do celular = +X, cima = -Z
          mag: parado ? 0 : c.mag / 255,
          correr: !parado && (c.seguros & BOTAO.correr) !== 0,
          comBola: this.temBola(j),
        },
        DT,
      );
    }

    // Quem está no chão ou deslizando não colide com os outros (SPEC 6.6)
    colidirJogadores(this.jogadores.filter((j) => !this.noChao(j) && !j.desliza && !j.bote && !j.mergulho).map((j) => j.corpo));
    const r = this.reinicio;
    for (const j of this.jogadores) {
      const cobrando = r !== null && r.cobrador === j.vaga.slot; // o cobrador de lateral pode ficar fora da linha
      if (!cobrando) limitarAoCampo(j.corpo, this.campo);
    }
    if (r) this.restringirReinicio(r);
  }

  /** Reinício: adversários a pelo menos 4 m da bola (5 m na falta); na saída, cada um na sua metade (SPEC 4.4, 4.5, 4.6). */
  private restringirReinicio(r: Reinicio): void {
    const minimo = r.tipo === "falta" ? PARTIDA.distanciaAdversarioFaltaM : PARTIDA.distanciaAdversarioReinicioM;
    for (const j of this.jogadores) {
      const c = j.corpo;
      if (r.tipo === "saida") {
        // Casa fica em X negativo (lado = -1), Visitante em X positivo (lado = +1): lado · x tem que ser pelo menos o raio.
        const lado = j.vaga.time === 0 ? -1 : 1;
        if (lado * c.x < JOGADOR.raio) {
          c.x = lado * JOGADOR.raio;
          c.vx = 0;
        }
      }
      if (j.vaga.time === r.time || j.desliza) continue;
      const dx = c.x - r.x;
      const dz = c.z - r.z;
      const d = Math.hypot(dx, dz);
      if (d < minimo) {
        const lado = j.vaga.time === 0 ? -1 : 1;
        const nx = d > 1e-6 ? dx / d : lado;
        const nz = d > 1e-6 ? dz / d : 0;
        c.x = r.x + nx * minimo;
        c.z = r.z + nz * minimo;
        limitarAoCampo(c, this.campo);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Domínio e condução (SPEC 6.3)
  // ---------------------------------------------------------------------------

  alvoDeConducao(j: JogadorPartida): [number, number] {
    return [j.corpo.x + Math.cos(j.corpo.dir) * DOMINIO.alvoConducao, j.corpo.z + Math.sin(j.corpo.dir) * DOMINIO.alvoConducao];
  }

  /**
   * Recepção (H1): uma bola solta que chega perto do pé de um jogador controlado por humano é amortecida e puxada para o ponto de
   * condução durante `RECEPCAO.duracaoS`. Só mexe na velocidade da bola (nada de teleporte): a velocidade dela em relação ao jogador
   * é amortecida e uma aceleração a empurra para o pé. Daí o domínio de sempre (SPEC 6.3) pega a bola.
   */
  private receberBola(): void {
    const b = this.bola;
    if (this.reinicio || b.naRede !== 0) return;
    const t = this.t;
    for (const j of this.jogadores) {
      if (controladoPorBot(j) || j.vaga.goleiro) continue;
      if (this.noChao(j) || j.mergulho || t < j.bloqueioAte || this.dominante === j.vaga.slot) {
        j.recepcaoAte = 0;
        continue;
      }
      const c = j.corpo;
      const dx = b.x - c.x;
      const dz = b.z - c.z;
      const d = Math.hypot(dx, dz) || 1e-6;

      if (t >= j.recepcaoAte) {
        // Começa? Só com a bola solta, perto, baixa, não rápida demais e chegando (ou quase parada)
        if (t < j.recepcaoProntaEm || this.dominante !== null) continue;
        if (d > RECEPCAO.raio || b.y > RECEPCAO.alturaMax) continue;
        const rvx = b.vx - c.vx;
        const rvz = b.vz - c.vz;
        const vr = Math.hypot(rvx, b.vy, rvz);
        if (vr > RECEPCAO.velocidadeMax) continue;
        const aproxima = -(rvx * dx + rvz * dz) / d;
        if (aproxima < RECEPCAO.aproximacaoMin && vr > RECEPCAO.velocidadeParada) continue;
        j.recepcaoAte = t + RECEPCAO.duracaoS;
        j.recepcaoProntaEm = t + RECEPCAO.recargaS;
        j.anim = ANIM.recepcao;
        j.animAte = j.recepcaoAte;
      } else if ((this.dominante !== null && this.dominante !== j.vaga.slot) || d > RECEPCAO.raioDesiste) {
        j.recepcaoAte = 0; // alguém pegou a bola, ou ela se afastou demais
        continue;
      }

      // Amortece: a velocidade da bola em relação ao jogador cai (como o pé recuando para tirar a força da bola)
      const k = Math.exp(-DT / RECEPCAO.amortecimentoS);
      b.vx = c.vx + (b.vx - c.vx) * k;
      b.vz = c.vz + (b.vz - c.vz) * k;
      b.vy *= k;
      // Puxa: aceleração limitada em direção ao pé (suave quando já está perto)
      const [tx, tz] = this.alvoDeConducao(j);
      const ex = tx - b.x;
      const ez = tz - b.z;
      const e = Math.hypot(ex, ez);
      if (e > 1e-3) {
        const a = RECEPCAO.puxao * Math.min(1, e / 0.5);
        b.vx += (ex / e) * a * DT;
        b.vz += (ez / e) * a * DT;
      }
      break; // uma recepção por vez
    }
  }

  private atualizarDominio(): void {
    const b = this.bola;
    const r = this.reinicio;

    // Reinício: a bola fica com o cobrador até ele agir
    if (r && r.cobrador !== null) {
      const cobrador = this.jogador(r.cobrador);
      if (cobrador && r.pronto) {
        this.dominante = cobrador.vaga.slot;
        this.conduzir(cobrador);
      } else {
        this.dominante = null;
      }
      return;
    }

    let melhor: JogadorPartida | null = null;
    let melhorDist = Infinity;
    let atual: JogadorPartida | null = null;
    let atualDist = Infinity;
    const candidatos = new Set<JogadorPartida>();

    for (const j of this.jogadores) {
      if (this.t < j.bloqueioAte || this.noChao(j) || j.mergulho) continue;
      const c = j.corpo;
      const goleiro = j.vaga.goleiro;
      const alcance = goleiro ? GOLEIRO.alcanceEmPe : DOMINIO.alcance;
      const altura = goleiro ? GOLEIRO.alturaEmPe : DOMINIO.alturaMax;
      const velMax = goleiro ? GOLEIRO.encaixaAteVelocidade : DOMINIO.velocidadeRelativaMax;
      if (Math.hypot(b.x - c.x, b.z - c.z) > alcance) continue;
      if (b.y > altura) continue;
      if (Math.hypot(b.vx - c.vx, b.vy, b.vz - c.vz) >= velMax) continue;

      candidatos.add(j);
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

    // O goleiro com a bola na mão não perde para ninguém (SPEC 6.7), e quem conduz a bola até o alcance dele a perde para ele
    let escolhido = melhor;
    const goleiroNaDisputa = atual ? [...candidatos].find((c) => c.vaga.goleiro && c.vaga.time !== atual!.vaga.time) : undefined;
    if (atual?.vaga.goleiro) escolhido = atual;
    else if (goleiroNaDisputa) escolhido = goleiroNaDisputa;
    // Disputa: fica com quem está mais perto do alvo de condução; empate, fica com quem já tinha.
    else if (atual && melhor !== atual && atualDist - melhorDist <= DOMINIO.disputaEmpateM) escolhido = atual;

    const novo = escolhido ? escolhido.vaga.slot : null;
    if (novo !== this.dominante && escolhido) {
      const rapida = Math.hypot(b.vx - escolhido.corpo.vx, b.vy, b.vz - escolhido.corpo.vz);
      if (escolhido.vaga.goleiro && rapida > 6) this.evento({ tipo: "defesa", dados: { slot: escolhido.vaga.slot, encaixou: true } });
      this.registrarToque(escolhido);
      escolhido.cerebro.segurandoDesde = escolhido.vaga.goleiro ? this.t : null;
    }
    this.dominante = novo;
    if (escolhido) this.conduzir(escolhido);
  }

  /** Mola com amortecimento em direção ao alvo, relativa à velocidade do jogador (a bola acompanha sem grudar). */
  private conduzir(j: JogadorPartida): void {
    const b = this.bola;
    const c = j.corpo;
    const [tx, tz] = this.alvoDeConducao(j);
    b.vx += (DOMINIO.molaRigidez * (tx - b.x) - DOMINIO.molaAmortecimento * (b.vx - c.vx)) * DT;
    b.vz += (DOMINIO.molaRigidez * (tz - b.z) - DOMINIO.molaAmortecimento * (b.vz - c.vz)) * DT;

    // "Toque" de drible a cada 0,35 s enquanto corre, para a bola não parecer colada no pé.
    if (velocidade(c) > 1 && this.t >= j.proximoToque) {
      b.vx += Math.cos(c.dir) * DOMINIO.toqueImpulso;
      b.vz += Math.sin(c.dir) * DOMINIO.toqueImpulso;
      j.proximoToque = this.t + DOMINIO.toqueIntervaloS;
    }
  }

  /** Bola que o jogador não consegue dominar (rápida demais, ou ele acabou de chutar) bate no corpo dele. */
  private colidirCorpoComBola(): void {
    const b = this.bola;
    const alcance = JOGADOR.raio + BOLA.raio;
    for (const j of this.jogadores) {
      if (this.dominante === j.vaga.slot || this.t < j.bloqueioAte || this.noChao(j) || j.vaga.goleiro) continue;
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
  // Toques, gols, bola fora, reinícios, fases
  // ---------------------------------------------------------------------------

  private registrarToque(j: JogadorPartida): void {
    const novo: Toque = {
      slot: j.vaga.slot,
      time: j.vaga.time,
      t: this.t,
      nome: j.vaga.nome,
      humano: j.vaga.humano,
      ...(j.vaga.idControle !== undefined ? { idControle: j.vaga.idControle } : {}),
    };
    if (this.ultimoToque && this.ultimoToque.slot !== novo.slot) this.penultimoToque = this.ultimoToque;
    this.ultimoToque = novo;
  }

  private registrarGol(lado: 1 | -1): void {
    // Bola no gol de X positivo = a Casa marcou.
    const time: 0 | 1 = lado === 1 ? 0 : 1;
    this.placar[time]++;
    this.bola.naRede = lado;

    const primeiro = this.jogadores.find((j) => j.vaga.time === time);
    const quem: Toque = this.ultimoToque ?? {
      slot: primeiro?.vaga.slot ?? 0,
      time,
      t: this.t,
      nome: primeiro?.vaga.nome ?? "?",
      humano: primeiro?.vaga.humano ?? false,
      ...(primeiro?.vaga.idControle !== undefined ? { idControle: primeiro.vaga.idControle } : {}),
    };
    const contra = quem.time !== time;
    let assistencia: number | undefined;
    let nomeAssistencia: string | undefined;
    const p = this.penultimoToque;
    if (!contra && p && p.time === time && p.slot !== quem.slot && this.t - p.t <= PARTIDA.assistenciaJanelaS) {
      assistencia = p.slot;
      this.assistenciasPorSlot.set(p.slot, (this.assistenciasPorSlot.get(p.slot) ?? 0) + 1);
      const ca = this.creditoDe(p);
      ca.assistencias++;
      nomeAssistencia = ca.nome;
    }
    // Quem fez, pelo nome de agora: o humano pode já ter trocado de jogador desde o chute (G1)
    const cg = this.creditoDe(quem);
    if (!contra) cg.gols++;
    const nomeGol = cg.nome;

    this.gols.push({ slot: quem.slot, tick: this.tick, contra, nome: nomeGol });
    this.dominante = null;
    this.reinicio = null;
    this.fase = FASE.gol;
    this.faseAte = this.t + PARTIDA.golComemoracaoS;
    if (this.emProrrogacao) this.fimAposGol = true; // gol de ouro: acabou
    this.saidaTime = time === 0 ? 1 : 0; // quem sofreu o gol sai jogando
    this.evento({
      tipo: "gol",
      dados: {
        time,
        slot: quem.slot,
        ...(assistencia !== undefined ? { assistencia } : {}),
        contra,
        placar: [this.placar[0], this.placar[1]],
        nome: nomeGol,
        ...(nomeAssistencia !== undefined ? { nomeAssistencia } : {}),
      },
    });
  }

  /** Modo Campo: bola que saiu inteira pela lateral ou pela linha de fundo (SPEC 4.5). */
  private verificarSaidaDeBola(): void {
    const c = this.campo;
    const b = this.bola;
    if (c.paredes || b.naRede !== 0) return;
    const r = BOLA.raio;
    const ultimo = this.ultimoToque?.time ?? this.saidaTime;

    if (Math.abs(b.z) - r > c.metadeLarg) {
      // Lateral: cobra o time que NÃO tocou por último
      const time: 0 | 1 = ultimo === 0 ? 1 : 0;
      const x = Math.max(-c.metadeComp + 2, Math.min(c.metadeComp - 2, b.x));
      this.apitarBolaFora();
      this.iniciarReinicio("lateral", time, x, Math.sign(b.z) * c.metadeLarg);
    } else if (Math.abs(b.x) - r > c.metadeComp) {
      const fim = Math.sign(b.x) as 1 | -1; // fim +1: o gol de X positivo, que a Casa ataca
      const atacante: 0 | 1 = fim === 1 ? 0 : 1;
      const defensor: 0 | 1 = atacante === 0 ? 1 : 0;
      this.apitarBolaFora();
      if (ultimo === atacante) {
        // Atacante chutou para fora: tiro de meta do defensor (o goleiro bot repõe)
        this.iniciarReinicio("tiroDeMeta", defensor, fim * (c.metadeComp - 3), 0);
      } else {
        // Defensor tirou para fora: escanteio do atacante
        const sz = b.z >= 0 ? 1 : -1;
        this.iniciarReinicio("escanteio", atacante, fim * (c.metadeComp - 0.2), sz * (c.metadeLarg - 0.2));
      }
    }
  }

  private apitarBolaFora(): void {
    this.evento({ tipo: "apito", dados: { motivo: "reinicio" } });
  }

  /**
   * Põe a bola no ponto do reinício, escolhe quem cobra e manda ele deslizar até lá em até 1 s (SPEC 4.5).
   * Humano tem preferência (se estiver perto); a cobrança sai quando o cobrador age, ou sozinha depois de 5 s.
   */
  iniciarReinicio(tipo: Exclude<TipoReinicio, "saida">, time: 0 | 1, x: number, z: number, evitar?: number): void {
    const t = this.t;
    const b = this.bola;
    b.x = x;
    b.y = BOLA.raio;
    b.z = z;
    b.vx = b.vy = b.vz = 0;
    b.naRede = 0;
    this.dominante = null;
    this.fase = FASE.reinicio;
    for (const j of this.jogadores) {
      j.bote = null;
      j.cerebro.segurandoDesde = null;
    }
    if (tipo !== "falta") this.evento({ tipo, dados: { time, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 } });

    const cobrador = this.escolherCobrador(tipo, time, x, z, evitar);
    if (!cobrador) {
      // Ninguém para cobrar (time sem jogadores): a bola entra em jogo na hora
      this.reinicio = null;
      this.fase = FASE.jogo;
      return;
    }

    // Para onde o cobrador olha: a bola fica à frente dele (alvo de condução a 0,55 m)
    const dir = this.direcaoDaCobranca(tipo, time, x, z);
    this.reinicio = { tipo, time, x, z, cobrador: cobrador.vaga.slot, pronto: false, desde: t, prontoEm: null };
    const c = cobrador.corpo;
    const x1 = x - Math.cos(dir) * DOMINIO.alvoConducao;
    const z1 = z - Math.sin(dir) * DOMINIO.alvoConducao;
    c.dir = dir;
    c.vx = c.vz = 0;
    const d = Math.hypot(x1 - c.x, z1 - c.z);
    cobrador.carrinho = null;
    cobrador.mergulho = null;
    cobrador.caidoAte = Math.min(cobrador.caidoAte, t); // quem cobra levanta
    cobrador.desliza = { x0: c.x, z0: c.z, x1, z1, desde: t, duracao: Math.max(0.05, Math.min(PARTIDA.cobradorDeslizaS, d / 12)) };
  }

  private escolherCobrador(tipo: TipoReinicio, time: 0 | 1, x: number, z: number, evitar?: number): JogadorPartida | undefined {
    const doTime = this.jogadores.filter((j) => j.vaga.time === time && j.vaga.slot !== evitar && !this.noChao(j));
    const goleiro = doTime.find((j) => j.vaga.goleiro);
    if (tipo === "tiroDeMeta" && goleiro) return goleiro;
    const linha = doTime.filter((j) => !j.vaga.goleiro);
    const perto = (a: JogadorPartida, b: JogadorPartida): number =>
      Math.hypot(a.corpo.x - x, a.corpo.z - z) - Math.hypot(b.corpo.x - x, b.corpo.z - z);
    const humanos = linha.filter((j) => !controladoPorBot(j)).sort(perto);
    const bots = linha.filter((j) => controladoPorBot(j)).sort(perto);
    const h = humanos[0];
    if (h && Math.hypot(h.corpo.x - x, h.corpo.z - z) <= PARTIDA.cobradorHumanoMaxM) return h;
    return bots[0] ?? h ?? goleiro;
  }

  private direcaoDaCobranca(tipo: TipoReinicio, time: 0 | 1, x: number, z: number): number {
    const ataque = time === 0 ? 1 : -1;
    const c = this.campo;
    if (tipo === "lateral") return Math.atan2(-Math.sign(z), ataque * 0.6);
    if (tipo === "escanteio") return Math.atan2(-z, Math.sign(x) * (c.metadeComp - 6) - x);
    if (tipo === "tiroDeMeta") return Math.atan2(0, -Math.sign(x));
    return Math.atan2(0, ataque); // falta: de frente para o gol adversário
  }

  /** O cobrador terminou de deslizar: está com a bola e a espera de 5 s para a cobrança automática começa. */
  private cobradorChegou(j: JogadorPartida): void {
    const r = this.reinicio;
    j.desliza = null;
    if (!r || r.cobrador !== j.vaga.slot) return;
    r.pronto = true;
    r.prontoEm = this.t;
    j.bloqueioAte = 0;
    j.chute = { apertado: false, comBola: true, desde: 0 };
    j.passe = { apertado: false, comBola: true, desde: 0 };
    j.cerebro.segurandoDesde = this.t;
    j.anim = ANIM.cobranca;
    j.animAte = this.t + 3600;
  }

  /** A bola entra em jogo: o relógio volta a correr. */
  soltarReinicio(): void {
    const r = this.reinicio;
    if (r?.cobrador !== null && r?.cobrador !== undefined) {
      const j = this.jogador(r.cobrador);
      if (j) {
        j.animAte = 0;
        j.desliza = null;
      }
    }
    this.reinicio = null;
    this.fase = FASE.jogo;
  }

  /** Cobrança automática de 5 s (SPEC 4.5): o humano que não agir tem a bola passada por ele. */
  private cobrancaAutomatica(): void {
    const r = this.reinicio;
    if (!r || !r.pronto || r.cobrador === null || r.prontoEm === null || r.tipo === "saida") return;
    if (this.t - r.prontoEm < PARTIDA.cobrancaAutomaticaS) return;
    const j = this.jogador(r.cobrador);
    if (!j || !this.temBola(j)) return;
    const [dx, dz] = this.direcaoDe(j);
    this.passarComo(j, false, dx, dz, { cone: 140 });
  }

  private avancarFase(): void {
    switch (this.fase) {
      case FASE.preJogo:
        if (this.t >= this.faseAte) {
          this.evento({ tipo: "apito", dados: { motivo: "inicio" } });
          this.entrarNaSaida();
        }
        return;
      case FASE.reinicio: {
        const r = this.reinicio;
        if (!r) {
          this.fase = FASE.jogo;
          return;
        }
        if (r.tipo === "saida") {
          // O jogo solta quando quem cobra toca na bola, ou depois de 3 s.
          if (this.dominante !== null || this.t >= r.desde + PARTIDA.saidaSoltaAposS) this.soltarReinicio();
        } else {
          this.cobrancaAutomatica();
          // Rede de segurança: se ninguém conseguir cobrar, solta a bola.
          if (this.reinicio && this.t - r.desde > 20) this.soltarReinicio();
        }
        return;
      }
      case FASE.jogo:
        this.relogio = Math.max(0, this.relogio - DT);
        if (this.relogio <= 0) {
          if (this.config.golDeOuro && !this.emProrrogacao && this.placar[0] === this.placar[1]) this.iniciarProrrogacao();
          else this.terminar();
        }
        return;
      case FASE.gol:
        if (this.t >= this.faseAte) {
          if (this.fimAposGol) {
            this.terminar();
            return;
          }
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
    this.reinicio = { tipo: "saida", time: this.saidaTime, x: 0, z: 0, cobrador: null, pronto: true, desde: this.t, prontoEm: this.t };
    this.evento({ tipo: "saida", dados: { time: this.saidaTime } });
  }

  /** Empatou no tempo normal com o gol de ouro ligado: bola ao centro e o primeiro gol decide (F8b). */
  private iniciarProrrogacao(): void {
    this.emProrrogacao = true;
    this.relogio = PARTIDA.prorrogacaoS;
    this.dominante = null;
    this.reinicio = null;
    this.posicionarParaSaida();
    this.evento({ tipo: "prorrogacao", dados: { segundos: PARTIDA.prorrogacaoS } });
    this.entrarNaSaida();
  }

  private terminar(): void {
    this.fase = FASE.fim;
    this.dominante = null;
    this.reinicio = null;
    this.evento({ tipo: "apito", dados: { motivo: "fim" } });
    this.evento({ tipo: "fim", dados: { placar: [this.placar[0], this.placar[1]] } });
  }

  /** Bola no centro e cada time na sua formação, na sua metade; quem cobra a saída começa perto da bola. */
  private posicionarParaSaida(): void {
    const b = this.bola;
    b.x = 0;
    b.y = BOLA.raio;
    b.z = 0;
    b.vx = b.vy = b.vz = 0;
    b.naRede = 0;

    for (const time of [0, 1] as const) {
      const lado = time === 0 ? -1 : 1;
      const pos = posicoesDeSaida(this, time);
      const doTime = this.jogadores.filter((j) => j.vaga.time === time);
      // Quem cobra: o humano, se houver; senão o jogador mais à frente na formação
      const linha = doTime.filter((j) => !j.vaga.goleiro);
      let cobrador = linha.find((j) => !controladoPorBot(j));
      if (!cobrador) {
        let melhor = -Infinity;
        for (const j of linha) {
          const p = pos.get(j.vaga.slot);
          if (p && -lado * p.x > melhor) {
            melhor = -lado * p.x;
            cobrador = j;
          }
        }
      }

      for (const j of doTime) {
        const c = j.corpo;
        const p = pos.get(j.vaga.slot);
        if (p) {
          c.x = p.x;
          c.z = p.z;
        }
        if (time === this.saidaTime && j === cobrador) {
          c.x = lado * 1.2;
          c.z = 0;
        }
        c.vx = c.vz = 0;
        c.dir = time === 0 ? 0 : Math.PI;
        c.energia = JOGADOR.energiaMax;
        c.exausto = false;
        j.bloqueioAte = 0;
        j.caidoAte = 0;
        j.carrinho = null;
        j.bote = null;
        j.mergulho = null;
        j.desliza = null;
        j.animAte = 0;
        j.chute = { apertado: false, comBola: false, desde: 0 };
        j.passe = { apertado: false, comBola: false, desde: 0 };
        j.cerebro.segurandoDesde = null;
        j.cerebro.detectadoEm = null;
      }
    }
    this.dominante = null;
    this.reinicio = null;
  }

  private evento(e: EventoJogo): void {
    this.eventos.push({ tick: this.tick, ...e });
  }

  // ---------------------------------------------------------------------------
  // Saída para o servidor
  // ---------------------------------------------------------------------------

  private animacaoDe(j: JogadorPartida, v: number): number {
    const t = this.t;
    if (this.fase === FASE.gol && j.vaga.time === (this.saidaTime === 0 ? 1 : 0)) return ANIM.comemoracao;
    if (j.carrinho) return ANIM.carrinho;
    if (j.caidoAte > t) return ANIM.queda;
    if (j.mergulho) return j.mergulho.zAlvo < j.mergulho.z0 ? ANIM.goleiroMergulhoEsq : ANIM.goleiroMergulhoDir;
    if (t < j.animAte && j.anim !== ANIM.parado) return j.anim;
    if (j.vaga.goleiro) return this.dominante === j.vaga.slot ? ANIM.goleiroComBola : ANIM.goleiroParado;
    if (j.corpo.arrancando && v > 0.3) return ANIM.arrancada;
    return v > 0.3 ? ANIM.corrida : ANIM.parado;
  }

  /** O estado do jogo em bytes-prontos: dados para o snapshot binário. */
  snapshot(): Snapshot {
    const jogadores: JogadorSnap[] = this.jogadores.map((j) => {
      const c = j.corpo;
      const v = velocidade(c);
      const carregando = j.chute.apertado && j.chute.comBola && this.dominante === j.vaga.slot && !controladoPorBot(j);
      return {
        slot: j.vaga.slot,
        x: c.x,
        z: c.z,
        dir: ((c.dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
        vel: v,
        anim: this.animacaoDe(j, v),
        caido: this.noChao(j) && !j.carrinho,
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
  estadoDe(slot: number): { comBola: boolean; energia: number; situacao: SituacaoJogador } | null {
    const j = this.jogador(slot);
    if (!j) return null;
    let situacao: SituacaoJogador = "normal";
    const r = this.reinicio;
    if (this.noChao(j)) situacao = "caido";
    else if (r && r.cobrador === slot && r.pronto) {
      situacao = r.tipo === "escanteio" ? "escanteio" : r.tipo === "falta" ? "falta" : "lateral";
    }
    return { comBola: this.dominante === slot, energia: Math.round(j.corpo.energia), situacao };
  }

  /** Resumo do fim da partida (mensagem `fim`). */
  resumo(): Fim {
    // Pelo nome de quem fez (o humano muda de jogador durante o jogo, G1). Empate: fica com quem fez primeiro.
    const melhor = (campo: "gols" | "assistencias" | "desarmes"): Destaque | null => {
      let m: Credito | null = null;
      for (const c of this.estatisticas) if (c[campo] > (m ? m[campo] : 0)) m = c;
      return m ? { slot: m.slot, quantidade: m[campo], nome: m.nome } : null;
    };
    return {
      t: "fim",
      placar: [this.placar[0], this.placar[1]],
      gols: this.gols.map((g) => ({ ...g })),
      ...(this.emProrrogacao ? { prorrogacao: true } : {}),
      destaques: { artilheiro: melhor("gols"), assistencias: melhor("assistencias"), desarmes: melhor("desarmes") },
    };
  }

  // ---------------------------------------------------------------------------
  // Só para testes e para a rota de teste do servidor (NODE_ENV=test)
  // ---------------------------------------------------------------------------

  /** Muda o tempo que falta para o fim da partida (para ver a tela de fim sem esperar). */
  definirRelogioParaTeste(segundos: number): void {
    this.relogio = Math.max(0, segundos);
  }

  /** Põe um jogador e a bola onde o teste quer, a bola parada, e solta o jogo (fase "jogo"). */
  posicionarParaTeste(slot: number, x: number, z: number, bolaX: number, bolaZ: number, dir = 0): void {
    const j = this.jogador(slot);
    if (!j) return;
    j.corpo.x = x;
    j.corpo.z = z;
    j.corpo.vx = j.corpo.vz = 0;
    j.corpo.dir = dir;
    j.desliza = null;
    j.carrinho = null;
    j.bote = null;
    j.caidoAte = 0;
    this.bola.x = bolaX;
    this.bola.y = BOLA.raio;
    this.bola.z = bolaZ;
    this.bola.vx = this.bola.vy = this.bola.vz = 0;
    this.bola.naRede = 0;
    this.dominante = null;
    this.reinicio = null;
    this.fase = FASE.jogo;
  }
}
