import type { Config } from "../protocolo/config";

// Campeonato da sala (F8a): tabela de pontos corridos dos clubes e estatísticas de cada jogador humano, só na memória do servidor
// (some quando a sala fecha). Lógica pura: o servidor entrega o resultado de cada partida que termina.

export const PONTOS = { vitoria: 3, empate: 1, derrota: 0 } as const;

export interface LinhaClube {
  /** Id do clube em times.json. */
  clube: string;
  pontos: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golsPro: number;
  golsContra: number;
  saldo: number;
}

export interface LinhaJogador {
  apelido: string;
  partidas: number;
  vitorias: number;
  gols: number;
  assistencias: number;
  desarmes: number;
}

export interface ResultadoDaPartida {
  casa: string;
  visitante: string;
  placar: [number, number];
  /** Só os humanos. */
  jogadores: Array<{ apelido: string; time: 0 | 1; gols: number; assistencias: number; desarmes: number }>;
}

/** Mensagem `campeonato` (servidor para telões e controles). */
export interface CampeonatoMsg {
  t: "campeonato";
  partidas: number;
  clubes: LinhaClube[];
  jogadores: LinhaJogador[];
}

/** O que a `Partida` guarda e o campeonato precisa, sem importar a classe inteira. */
export interface FonteDeEstatisticas {
  config: Config;
  placar: [number, number];
  /** O que cada um fez, pelo nome (o humano muda de jogador durante o jogo, G1). Só os humanos entram no campeonato. */
  estatisticas: ReadonlyArray<{ nome: string; time: 0 | 1; humano: boolean; gols: number; assistencias: number; desarmes: number }>;
}

/** Monta o resultado de uma partida terminada. Gol contra não conta como gol do jogador (já está no placar do outro time). */
export function resultadoDaPartida(p: FonteDeEstatisticas): ResultadoDaPartida {
  return {
    casa: p.config.casa,
    visitante: p.config.visitante,
    placar: [p.placar[0], p.placar[1]],
    jogadores: p.estatisticas
      .filter((c) => c.humano)
      .map((c) => ({ apelido: c.nome, time: c.time, gols: c.gols, assistencias: c.assistencias, desarmes: c.desarmes })),
  };
}

const chaveDoApelido = (a: string): string => a.trim().toLowerCase();

export class Campeonato {
  private readonly clubes = new Map<string, LinhaClube>();
  private readonly jogadores = new Map<string, LinhaJogador>();
  partidas = 0;

  zerar(): void {
    this.clubes.clear();
    this.jogadores.clear();
    this.partidas = 0;
  }

  private linhaDoClube(id: string): LinhaClube {
    let l = this.clubes.get(id);
    if (!l) {
      l = { clube: id, pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0, saldo: 0 };
      this.clubes.set(id, l);
    }
    return l;
  }

  registrar(r: ResultadoDaPartida): void {
    this.partidas++;
    const [a, b] = r.placar;
    const lados: Array<[string, number, number]> = [
      [r.casa, a, b],
      [r.visitante, b, a],
    ];
    for (const [id, pro, contra] of lados) {
      const l = this.linhaDoClube(id);
      l.jogos++;
      l.golsPro += pro;
      l.golsContra += contra;
      l.saldo = l.golsPro - l.golsContra;
      if (pro > contra) {
        l.vitorias++;
        l.pontos += PONTOS.vitoria;
      } else if (pro === contra) {
        l.empates++;
        l.pontos += PONTOS.empate;
      } else {
        l.derrotas++;
        l.pontos += PONTOS.derrota;
      }
    }

    for (const j of r.jogadores) {
      const chave = chaveDoApelido(j.apelido);
      let l = this.jogadores.get(chave);
      if (!l) {
        l = { apelido: j.apelido, partidas: 0, vitorias: 0, gols: 0, assistencias: 0, desarmes: 0 };
        this.jogadores.set(chave, l);
      }
      l.apelido = j.apelido; // o apelido mais recente (com a maiúscula que a pessoa usou por último)
      l.partidas++;
      l.gols += j.gols;
      l.assistencias += j.assistencias;
      l.desarmes += j.desarmes;
      const meu = j.time === 0 ? a : b;
      const deles = j.time === 0 ? b : a;
      if (meu > deles) l.vitorias++;
    }
  }

  /** Tabela: pontos, depois vitórias, saldo de gols, gols pró e, no fim, o id (para a ordem ser sempre a mesma). */
  tabelaDeClubes(): LinhaClube[] {
    return [...this.clubes.values()]
      .map((l) => ({ ...l }))
      .sort((x, y) => y.pontos - x.pontos || y.vitorias - x.vitorias || y.saldo - x.saldo || y.golsPro - x.golsPro || x.clube.localeCompare(y.clube));
  }

  /** Jogadores: mais gols primeiro, depois assistências, desarmes, vitórias e nome. */
  ranking(): LinhaJogador[] {
    return [...this.jogadores.values()]
      .map((l) => ({ ...l }))
      .sort((x, y) => y.gols - x.gols || y.assistencias - x.assistencias || y.desarmes - x.desarmes || y.vitorias - x.vitorias || x.apelido.localeCompare(y.apelido));
  }

  mensagem(): CampeonatoMsg {
    return { t: "campeonato", partidas: this.partidas, clubes: this.tabelaDeClubes(), jogadores: this.ranking() };
  }
}
