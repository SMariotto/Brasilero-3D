import { randomBytes, randomInt } from "node:crypto";
import { SERVIDOR, normalizarSala } from "@b3d/core";
import { Sala } from "./sala";

export interface OpcoesSalas {
  maxSalas: number;
  agora?: () => number;
  /** Sorteia um inteiro em [0, max). Os testes trocam por algo previsível. */
  sortear?: (max: number) => number;
  gerarToken?: () => string;
  /** Sorteia a semente de cada partida. */
  semente?: () => number;
  /** Só testes: partidas sem bots nem goleiros. */
  semBots?: boolean;
}

/** Todas as salas de um servidor: criar, achar e apagar as abandonadas. */
export class Salas {
  private readonly mapa = new Map<string, Sala>();
  private readonly agora: () => number;
  private readonly sortear: (max: number) => number;
  private readonly gerarToken: () => string;
  private readonly maxSalas: number;
  private readonly semente: (() => number) | undefined;
  private readonly semBots: boolean;

  constructor(opcoes: Partial<OpcoesSalas> = {}) {
    this.maxSalas = opcoes.maxSalas ?? SERVIDOR.maxSalasPadrao;
    this.semente = opcoes.semente;
    this.semBots = opcoes.semBots ?? false;
    this.agora = opcoes.agora ?? Date.now;
    this.sortear = opcoes.sortear ?? ((max) => randomInt(max));
    this.gerarToken = opcoes.gerarToken ?? (() => randomBytes(16).toString("hex"));
  }

  get total(): number {
    return this.mapa.size;
  }

  get conexoes(): number {
    let n = 0;
    for (const s of this.mapa.values()) n += s.conexoes;
    return n;
  }

  /** Cria uma sala com código livre, ou `null` se o servidor já está no limite. */
  criar(): Sala | null {
    if (this.mapa.size >= this.maxSalas) return null;
    for (;;) {
      const codigo = this.novoCodigo();
      if (this.mapa.has(codigo)) continue;
      const sala = new Sala(codigo, this.agora, this.gerarToken, { ...(this.semente ? { semente: this.semente } : {}), semBots: this.semBots });
      this.mapa.set(codigo, sala);
      return sala;
    }
  }

  achar(codigo: string): Sala | undefined {
    return this.mapa.get(normalizarSala(codigo));
  }

  /** Roda o laço de jogo de cada sala e devolve o tempo do passo mais lento (ms). */
  avancar(): number {
    let pior = 0;
    for (const sala of this.mapa.values()) pior = Math.max(pior, sala.avancar());
    return pior;
  }

  /** Roda a manutenção de cada sala e apaga as que ficaram vazias tempo demais. */
  varrer(): void {
    for (const [codigo, sala] of this.mapa) {
      if (sala.varrer()) {
        sala.encerrar();
        this.mapa.delete(codigo);
      }
    }
  }

  private novoCodigo(): string {
    let c = "";
    for (let i = 0; i < SERVIDOR.tamanhoCodigoSala; i++) c += SERVIDOR.alfabetoSala[this.sortear(SERVIDOR.alfabetoSala.length)];
    return c;
  }
}
