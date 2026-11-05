import type { EventoJogo } from "@b3d/core";

// Sons do telão (SPEC 8), todos gerados por código com Web Audio: nenhum arquivo de áudio.
// A parte "o que toca quando" é pura e tem teste; a parte que fabrica o som usa o AudioContext do navegador.

export type NomeDoSom = "chute" | "passe" | "apito" | "apitoFinal" | "apitoCurto" | "uuh" | "gol" | "bote" | "defesa" | "trave";

export interface PedidoDeSom {
  som: NomeDoSom;
  /** 0 a 1. */
  volume: number;
}

const entre = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** Quais sons um evento do jogo dispara. */
export function sonsDoEvento(e: EventoJogo): PedidoDeSom[] {
  switch (e.tipo) {
    case "chute":
      return [{ som: "chute", volume: entre(0.35 + e.dados.forca * 0.65, 0.3, 1) }];
    case "passe":
      return [{ som: "passe", volume: e.dados.alto ? 0.75 : 0.55 }];
    case "roubo":
      return [{ som: "bote", volume: e.dados.jeito === "carrinho" ? 0.9 : 0.6 }];
    case "apito":
      if (e.dados.motivo === "fim") return [{ som: "apitoFinal", volume: 0.8 }];
      if (e.dados.motivo === "falta") return [{ som: "apito", volume: 0.8 }];
      return [{ som: "apitoCurto", volume: 0.7 }];
    case "gol":
      return [{ som: "gol", volume: 1 }];
    case "trave":
      return [{ som: "trave", volume: 0.8 }, { som: "uuh", volume: 0.8 }];
    case "defesa":
      // Defesa que o goleiro encaixa é mais calma; a espalmada faz a torcida soltar o "uuuh"
      return e.dados.encaixou ? [{ som: "defesa", volume: 0.55 }] : [{ som: "defesa", volume: 0.75 }, { som: "uuh", volume: 0.55 }];
    default:
      return [];
  }
}

/**
 * Quão animada a torcida está, de 0 a 1: sobe quando a bola chega perto de um dos gols.
 * `x` é a posição da bola ao longo do campo (0 = meio) e `comp` o comprimento do campo.
 */
export function intensidadeDaTorcida(x: number, comp: number): number {
  const distanciaDoGol = Math.max(0, comp / 2 - Math.abs(x));
  return entre(1 - distanciaDoGol / (comp * 0.32), 0, 1);
}

const CHAVE_MUDO = "b3d.mudo";

function lerMudoGuardado(): boolean | null {
  try {
    const v = localStorage.getItem(CHAVE_MUDO);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

/**
 * O som do telão. Padrão: só o telão PRINCIPAL toca (os outros telões da mesma sala ficam mudos), a menos que a pessoa escolha
 * outra coisa no botão (isso fica guardado neste navegador). O navegador só libera o áudio depois de um toque ou clique:
 * `destravar()` é chamado nesse primeiro gesto.
 */
export class Som {
  private ctx: AudioContext | null = null;
  private saida: GainNode | null = null;
  private torcida: { ganho: GainNode; filtro: BiquadFilterNode } | null = null;
  private ruido: AudioBuffer | null = null;
  private escolhaDaPessoa: boolean | null = lerMudoGuardado();
  private principal = true;
  private intensidade = 0;
  private festaAte = 0;
  private aoMudar: () => void = () => undefined;

  /** Chamado quando o estado do botão (mudo, travado) muda, para o botão se redesenhar. */
  aoMudarEstado(fn: () => void): void {
    this.aoMudar = fn;
  }

  /** O telão principal toca; os extras ficam mudos até a pessoa ligar. */
  definirPrincipal(principal: boolean): void {
    this.principal = principal;
    this.aplicarMudo();
    this.aoMudar();
  }

  get mudo(): boolean {
    return this.escolhaDaPessoa ?? !this.principal;
  }

  /** O navegador ainda não deixou tocar (falta um toque ou clique na página). */
  get travado(): boolean {
    return !this.mudo && (!this.ctx || this.ctx.state !== "running");
  }

  alternarMudo(): void {
    this.escolhaDaPessoa = !this.mudo;
    try {
      localStorage.setItem(CHAVE_MUDO, this.escolhaDaPessoa ? "1" : "0");
    } catch {
      /* sem armazenamento: vale só nesta página */
    }
    this.destravar();
    this.aplicarMudo();
    this.aoMudar();
  }

  /** Cria e liberta o AudioContext. Tem que rodar dentro de um clique, toque ou tecla. */
  destravar(): void {
    try {
      if (!this.ctx) {
        const Construtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Construtor) return;
        this.ctx = new Construtor();
        this.saida = this.ctx.createGain();
        this.saida.connect(this.ctx.destination);
        this.montarTorcida();
        this.aplicarMudo();
      }
      if (this.ctx.state !== "running") void this.ctx.resume().then(() => this.aoMudar());
    } catch {
      this.ctx = null; // sem áudio neste navegador: o jogo segue mudo
    }
    this.aoMudar();
  }

  private aplicarMudo(): void {
    if (!this.ctx || !this.saida) return;
    this.saida.gain.setTargetAtTime(this.mudo ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private pronto(): boolean {
    return !!this.ctx && !!this.saida && this.ctx.state === "running" && !this.mudo;
  }

  /** Um buffer de ruído branco de 2 s, que serve de matéria-prima para torcida, apito de ar, bote... */
  private ruidoBranco(): AudioBuffer {
    if (this.ruido) return this.ruido;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let marrom = 0;
    for (let i = 0; i < d.length; i++) {
      // ruído "rosado" simples (mistura de branco e marrom): soa mais como gente do que o branco puro
      marrom = (marrom + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = (Math.random() * 2 - 1) * 0.5 + marrom * 3.5;
    }
    this.ruido = buf;
    return buf;
  }

  private montarTorcida(): void {
    const ctx = this.ctx!;
    const fonte = ctx.createBufferSource();
    fonte.buffer = this.ruidoBranco();
    fonte.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.value = 520;
    filtro.Q.value = 0.6;
    const ganho = ctx.createGain();
    ganho.gain.value = 0;
    fonte.connect(filtro).connect(ganho).connect(this.saida!);
    fonte.start();
    this.torcida = { ganho, filtro };
  }

  /** Chamado ~30 vezes por segundo com a posição da bola: a torcida sobe perto do gol. */
  ambiente(bolaX: number, comp: number): void {
    this.intensidade = intensidadeDaTorcida(bolaX, comp);
    if (!this.pronto() || !this.torcida || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Depois de um gol a torcida fica alta e vai baixando em ~3 s
    const festa = Math.max(0, this.festaAte - t) / 3;
    this.torcida.ganho.gain.setTargetAtTime(Math.max(0.05 + this.intensidade * 0.16, 0.3 * festa), t, 0.25);
    this.torcida.filtro.frequency.setTargetAtTime(480 + Math.max(this.intensidade, festa) * 420, t, 0.25);
  }

  /** Silencia a torcida (a partida acabou ou a sala fechou). */
  parar(): void {
    this.intensidade = 0;
    if (this.torcida && this.ctx) this.torcida.ganho.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  evento(e: EventoJogo): void {
    if (!this.pronto()) return;
    for (const p of sonsDoEvento(e)) this.tocar(p);
  }

  tocar(p: PedidoDeSom): void {
    if (!this.pronto()) return;
    try {
      this[p.som](p.volume);
    } catch {
      /* um som que falha não pode derrubar o jogo */
    }
  }

  // --- os sons -----------------------------------------------------------------------------------

  /** Um envelope: sobe rápido e desce até zero em `dur` segundos. */
  private envelope(ganho: GainNode, volume: number, ataque: number, dur: number, t0 = 0): void {
    const t = this.ctx!.currentTime + t0;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.linearRampToValueAtTime(volume, t + ataque);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private tom(tipo: OscillatorType, de: number, para: number, dur: number, volume: number, t0 = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    const t = ctx.currentTime + t0;
    o.frequency.setValueAtTime(de, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, para), t + dur);
    this.envelope(g, volume, 0.005, dur, t0);
    o.connect(g).connect(this.saida!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Um sopro de ruído filtrado. `freqDe` e `freqPara` deslizam o filtro durante o som. */
  private sopro(tipo: BiquadFilterType, freqDe: number, freqPara: number, dur: number, volume: number, ataque = 0.005, t0 = 0, q = 1): void {
    const ctx = this.ctx!;
    const fonte = ctx.createBufferSource();
    fonte.buffer = this.ruidoBranco();
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.Q.value = q;
    const t = ctx.currentTime + t0;
    filtro.frequency.setValueAtTime(freqDe, t);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(20, freqPara), t + dur);
    const g = ctx.createGain();
    this.envelope(g, volume, ataque, dur, t0);
    fonte.connect(filtro).connect(g).connect(this.saida!);
    fonte.start(t, Math.random());
    fonte.stop(t + dur + 0.05);
  }

  /** Grave curto e seco: a pancada da bola no pé. */
  private chute(v: number): void {
    this.tom("sine", 190, 55, 0.14, 0.9 * v);
    this.sopro("lowpass", 1800, 300, 0.07, 0.5 * v);
  }

  /** Mais leve que o chute. */
  private passe(v: number): void {
    this.tom("triangle", 240, 130, 0.09, 0.4 * v);
    this.sopro("bandpass", 1400, 700, 0.05, 0.3 * v, 0.003, 0, 1.2);
  }

  private bote(v: number): void {
    this.sopro("lowpass", 900, 150, 0.16, 0.7 * v);
    this.tom("sine", 110, 50, 0.12, 0.5 * v);
  }

  private defesa(v: number): void {
    this.sopro("bandpass", 1100, 500, 0.1, 0.45 * v, 0.004, 0, 1.5);
    this.tom("sine", 150, 80, 0.09, 0.4 * v);
  }

  private trave(v: number): void {
    // "Tóim": metal batendo, com resto de vibração
    this.tom("sine", 1250, 1100, 0.45, 0.35 * v);
    this.tom("square", 2480, 2300, 0.12, 0.08 * v);
    this.sopro("highpass", 3000, 2000, 0.05, 0.3 * v);
  }

  /** Apito: dois tons quase iguais com tremulação (a bolinha dentro do apito). */
  private apitoDe(dur: number, volume: number, t0 = 0): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGanho = ctx.createGain();
    lfo.frequency.value = 28;
    lfoGanho.gain.value = 0.3;
    lfo.connect(lfoGanho).connect(g.gain);
    const t = ctx.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume * 0.5, t + 0.02);
    g.gain.setValueAtTime(volume * 0.5, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const f of [2850, 3010]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    g.connect(this.saida!);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  private apito(v: number): void {
    this.apitoDe(0.45, v);
  }

  private apitoCurto(v: number): void {
    this.apitoDe(0.22, v);
  }

  /** Fim de jogo: três apitos, o último mais longo. */
  private apitoFinal(v: number): void {
    this.apitoDe(0.3, v, 0);
    this.apitoDe(0.3, v, 0.42);
    this.apitoDe(0.7, v, 0.84);
  }

  /** "Uuuuh" de quase gol: a torcida sobe e cai. */
  private uuh(v: number): void {
    this.sopro("bandpass", 380, 260, 1.1, 0.55 * v, 0.18, 0, 0.9);
    this.tom("sawtooth", 330, 190, 0.9, 0.05 * v, 0.05);
  }

  /** Gol: estouro, grave que balança o peito e a torcida explodindo por uns 3 s. */
  private gol(v: number): void {
    this.sopro("lowpass", 3800, 350, 1.4, 0.9 * v, 0.01);
    this.tom("sine", 90, 38, 0.7, 0.9 * v);
    this.sopro("bandpass", 600, 900, 3.2, 0.75 * v, 0.35, 0.1, 0.7);
    this.sopro("bandpass", 1500, 1000, 2.4, 0.3 * v, 0.5, 0.2, 0.8);
    if (this.ctx) this.festaAte = this.ctx.currentTime + 3; // a torcida de fundo fica alta (ver `ambiente`)
  }
}
