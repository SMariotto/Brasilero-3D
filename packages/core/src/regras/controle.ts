import { PARTIDA, TROCA } from "../constantes";
import { BOTAO, FASE, comandoParado, type Comando } from "../protocolo/binario";
import type { DonoDeSlot, VagaElenco } from "../protocolo/mensagens";
import type { Partida } from "./partida";
import type { JogadorPartida } from "./tipos-partida";

// Quem controla qual jogador (G1, estilo FIFA). Cada humano controla exatamente UM jogador de cada vez e dois humanos nunca
// controlam o mesmo. O resto do time é bot. As regras, em ordem de força:
//  1. Time com a bola: o humano controla quem está com ela. Se ninguém (humano) controla o portador, o primeiro da fila de
//     humanos do time assume. Com mais de um humano, quem já controla o portador continua com ele.
//  2. Passe de um humano para um bot: o humano que passou vai para o fim da fila e o primeiro da fila assume quem recebe, na hora
//     em que o passe sai. Se quem recebe já é controlado por outro humano, ele continua com esse humano.
//  3. Sem a bola (bola solta ou com o adversário): o humano controla o companheiro mais perto da bola, com histerese (só troca se
//     o outro estiver `TROCA.histereseM` mais perto) e uma pausa depois de cada troca.
//  4. CHUTE sem a bola troca à mão para o companheiro mais perto da bola (que não seja o atual).
// Goleiro nunca é controlado por humano.

export interface HumanoControle {
  id: number;
  nome: string;
  time: 0 | 1;
  /** O jogador que ele controla agora; `null` enquanto está sem jogador (caiu da conexão, ou acabou de voltar). */
  slot: number | null;
  /** Caiu da conexão: um bot joga no lugar dele e ele sai da fila até voltar. */
  ausente: boolean;
  /** O último comando que ele mandou; vai junto quando ele muda de jogador. */
  cmd: Comando;
  /** Já mandou algum comando desde que entrou (ou voltou)? Enquanto não, o primeiro pacote só inicializa a sequência de ações. */
  recebeu: boolean;
  /** Até esta hora (s de jogo) o gestor não troca este humano sozinho. */
  semAutoAte: number;
}

const ehLinha = (j: JogadorPartida): boolean => !j.vaga.goleiro;

export class GestorDeControle {
  private readonly humanos: HumanoControle[] = [];
  /** A fila rotativa de cada time: ids dos humanos presentes (não ausentes), do primeiro ao último. */
  private readonly filas: [number[], number[]] = [[], []];
  /** Sobe a cada mudança de quem controla o quê. O servidor compara para saber quando mandar `donos`. */
  versao = 0;

  /**
   * `dinamico` liga as trocas estilo FIFA. Desligado, cada humano fica na vaga em que começou (como na F2 e F3): serve
   * aos testes antigos, que dependem de um jogador fixo.
   */
  constructor(
    private readonly p: Partida,
    readonly dinamico: boolean,
  ) {}

  // --- consulta -----------------------------------------------------------

  humano(id: number): HumanoControle | undefined {
    return this.humanos.find((h) => h.id === id);
  }

  humanoNoSlot(slot: number): HumanoControle | undefined {
    return this.humanos.find((h) => h.slot === slot);
  }

  slotDe(id: number): number | null {
    return this.humano(id)?.slot ?? null;
  }

  /** Os ids da fila do time, do primeiro ao último (cópia). */
  fila(time: 0 | 1): number[] {
    return [...this.filas[time]];
  }

  /** Quantos humanos o time tem na partida (os que caíram também contam: eles voltam). */
  quantidade(time: 0 | 1): number {
    return this.humanos.filter((h) => h.time === time).length;
  }

  /** A lista completa de quem controla o quê, para a mensagem `donos`. */
  donos(): DonoDeSlot[] {
    return this.humanos
      .filter((h) => h.slot !== null && !h.ausente)
      .map((h) => ({ slot: h.slot!, id: h.id, nome: h.nome }))
      .sort((a, b) => a.slot - b.slot);
  }

  // --- entrada e saída de humanos -------------------------------------------

  /** Um humano que já vem no elenco da partida (a vaga dele fica como está). */
  registrarInicial(j: JogadorPartida): void {
    const v = j.vaga;
    const id = v.idControle ?? -(v.slot + 1); // testes antigos põem humano sem id
    const h: HumanoControle = { id, nome: v.nome, time: v.time, slot: v.slot, ausente: false, cmd: j.cmd, recebeu: false, semAutoAte: 0 };
    this.humanos.push(h);
    this.filas[v.time].push(id);
  }

  /**
   * Humano que entrou com a partida rolando. Fica com o jogador livre do time mais perto da bola (no modo antigo, o último bot do
   * time). Devolve a vaga, ou `null` se o time não tem jogador livre ou já está com 3 humanos.
   */
  adicionar(time: 0 | 1, nome: string, id: number): VagaElenco | null {
    if (this.dinamico && this.quantidade(time) >= PARTIDA.maxHumanosPorTime) return null;
    const livres = this.p.jogadores.filter((j) => j.vaga.time === time && ehLinha(j) && !j.vaga.humano);
    const escolhido = this.dinamico ? this.maisPertoDaBola(livres) : livres[livres.length - 1];
    if (!escolhido) return null;
    const h: HumanoControle = { id, nome, time, slot: null, ausente: false, cmd: comandoParado(), recebeu: false, semAutoAte: 0 };
    this.humanos.push(h);
    this.filas[time].push(id);
    this.atribuir(h, escolhido.vaga.slot);
    return escolhido.vaga;
  }

  /** A vaga dele venceu (caiu de vez): o jogador que ele controlava vira bot e ele sai da partida. */
  remover(id: number): void {
    const h = this.humano(id);
    if (!h) return;
    if (h.slot !== null) this.soltar(h.slot);
    this.humanos.splice(this.humanos.indexOf(h), 1);
    const f = this.filas[h.time];
    const i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1);
    this.versao++;
  }

  /**
   * Caiu da conexão (ou voltou). No modo dinâmico ele sai da fila e o jogador dele vira bot; ao voltar entra no fim da fila e
   * recebe o companheiro livre mais perto da bola. No modo antigo o bot joga na vaga fixa dele.
   */
  definirAusente(id: number, ausente: boolean): void {
    const h = this.humano(id);
    if (!h || h.ausente === ausente) return;
    h.ausente = ausente;
    if (!this.dinamico) {
      const j = h.slot !== null ? this.p.jogador(h.slot) : undefined;
      if (j) {
        j.ausente = ausente;
        if (!ausente) {
          j.cmd = comandoParado();
          j.acaoSeq = null;
        }
      }
      return;
    }
    const f = this.filas[h.time];
    if (ausente) {
      const i = f.indexOf(id);
      if (i >= 0) f.splice(i, 1);
      if (h.slot !== null) this.soltar(h.slot);
      h.slot = null;
      h.cmd = comandoParado();
    } else {
      f.push(id);
      h.recebeu = false;
      // Volta já com um jogador: o companheiro livre mais perto da bola
      const s = this.maisPertoDaBola(this.livresDo(h.time, h));
      if (s) this.atribuir(h, s.vaga.slot);
    }
    this.versao++;
  }

  // --- comandos ---------------------------------------------------------------

  /** O comando mais novo de um humano. Vale para o jogador que ele controla agora. */
  comando(id: number, cmd: Comando): void {
    const h = this.humano(id);
    if (!h) return;
    h.cmd = cmd;
    h.recebeu = true;
    if (h.slot === null || h.ausente) return;
    const j = this.p.jogador(h.slot);
    if (!j) return;
    j.cmd = cmd;
    if (j.acaoSeq === null) j.acaoSeq = cmd.acaoSeq; // primeiro pacote: não dispara ação antiga
  }

  // --- trocas -------------------------------------------------------------------

  /** Chamado a cada passo da partida, antes dos bots. */
  atualizar(): void {
    if (!this.dinamico) return;
    const p = this.p;
    const t = p.t;
    const jogando = p.fase === FASE.jogo || p.fase === FASE.reinicio;

    for (const time of [0, 1] as const) {
      const fila = this.filas[time].map((id) => this.humano(id)!);
      if (fila.length === 0) continue;

      // Todo humano presente tem sempre um jogador (também na comemoração e antes do jogo)
      for (const h of fila) {
        if (h.slot !== null) continue;
        const s = this.maisPertoDaBola(this.livresDo(time, h));
        if (s) this.atribuir(h, s.vaga.slot);
      }
      if (!jogando) continue;

      // 1. Time com a bola: o primeiro da fila assume o portador, se nenhum humano o controla
      const portador = this.portadorDoTime(time);
      if (portador && !this.humanoNoSlot(portador.vaga.slot)) {
        const h = fila[0]!;
        this.atribuir(h, portador.vaga.slot);
        h.semAutoAte = t + TROCA.travaAposTrocaS;
      }

      // 3. Sem a bola: o companheiro mais perto da bola, com histerese
      for (const h of fila) {
        if (h.slot === null || t < h.semAutoAte) continue;
        if (portador && h.slot === portador.vaga.slot) continue;
        const atual = p.jogador(h.slot);
        const melhor = this.maisPertoDaBola(this.livresDo(time, h));
        if (!atual || !melhor || melhor === atual) continue;
        if (this.distanciaDaBola(atual) - this.distanciaDaBola(melhor) > TROCA.histereseM) {
          this.atribuir(h, melhor.vaga.slot);
          h.semAutoAte = t + TROCA.travaAposTrocaS;
        }
      }
    }
  }

  /** O jogador `deSlot` (controlado por um humano) acabou de passar. O controle vai para quem recebe (regra 2). */
  aoPassar(deSlot: number, paraSlot: number | undefined): void {
    if (!this.dinamico || paraSlot === undefined) return;
    const passador = this.humanoNoSlot(deSlot);
    const alvo = this.p.jogador(paraSlot);
    if (!passador || !alvo || alvo.vaga.time !== passador.time || !ehLinha(alvo)) return;
    if (this.humanoNoSlot(paraSlot)) return; // já é de um humano: ele continua com esse humano

    const fila = this.filas[passador.time];
    fila.splice(fila.indexOf(passador.id), 1);
    fila.push(passador.id);
    const novo = this.humano(fila[0]!)!;
    this.atribuir(novo, paraSlot);
    novo.semAutoAte = this.p.t + TROCA.travaAposTrocaS;
  }

  /** CHUTE sem a bola (regra 4): o humano que controla `slot` passa para o companheiro livre mais perto da bola. */
  trocarManual(slot: number): boolean {
    if (!this.dinamico) return false;
    const h = this.humanoNoSlot(slot);
    if (!h) return false;
    const candidatos = this.livresDo(h.time, h).filter((j) => j.vaga.slot !== slot);
    const proximo = this.maisPertoDaBola(candidatos);
    if (!proximo) return false;
    this.atribuir(h, proximo.vaga.slot);
    h.semAutoAte = this.p.t + TROCA.travaAposManualS;
    return true;
  }

  // --- internos -----------------------------------------------------------------

  /** Quem está com a bola no time (jogador de linha), ou quem vai cobrar o reinício do time. */
  private portadorDoTime(time: 0 | 1): JogadorPartida | undefined {
    const p = this.p;
    const dono = p.dominante !== null ? p.jogador(p.dominante) : undefined;
    if (dono && dono.vaga.time === time && ehLinha(dono)) return dono;
    const r = p.reinicio;
    if (r && r.time === time && r.cobrador !== null) {
      const c = p.jogador(r.cobrador);
      if (c && ehLinha(c)) return c;
    }
    return undefined;
  }

  /** Jogadores de linha do time que o humano `h` pode controlar: livres (sem outro humano) e em pé, mais o que ele já controla. */
  private livresDo(time: 0 | 1, h: HumanoControle): JogadorPartida[] {
    return this.p.jogadores.filter((j) => {
      if (j.vaga.time !== time || !ehLinha(j)) return false;
      if (j.vaga.slot === h.slot) return true;
      return !this.humanoNoSlot(j.vaga.slot) && !this.p.noChao(j);
    });
  }

  private distanciaDaBola(j: JogadorPartida): number {
    return Math.hypot(j.corpo.x - this.p.bola.x, j.corpo.z - this.p.bola.z);
  }

  private maisPertoDaBola(candidatos: JogadorPartida[]): JogadorPartida | undefined {
    let melhor: JogadorPartida | undefined;
    let melhorD = Infinity;
    for (const j of candidatos) {
      const d = this.distanciaDaBola(j);
      if (d < melhorD) {
        melhorD = d;
        melhor = j;
      }
    }
    return melhor;
  }

  /** O humano passa a controlar `slot`; o jogador que ele largou vira bot. */
  private atribuir(h: HumanoControle, slot: number): void {
    if (h.slot === slot) return;
    if (h.slot !== null) this.soltar(h.slot);
    h.slot = slot;
    const j = this.p.jogador(slot);
    if (j) {
      const v = j.vaga;
      v.humano = true;
      v.idControle = h.id;
      v.nome = h.nome;
      j.ausente = false;
      j.cmd = h.cmd;
      j.acaoSeq = h.recebeu ? h.cmd.acaoSeq : null; // o que já foi tocado antes da troca não dispara de novo
      // Um botão que já estava seguro na troca não conta como aperto novo (senão CHUTE seguro viraria outra troca)
      const t = this.p.t;
      const comBola = this.p.temBola(j);
      j.chute = { apertado: (h.cmd.seguros & BOTAO.chute) !== 0, comBola: comBola && (h.cmd.seguros & BOTAO.chute) === 0, desde: t };
      j.passe = { apertado: (h.cmd.seguros & BOTAO.passe) !== 0, comBola: comBola && (h.cmd.seguros & BOTAO.passe) === 0, desde: t };
    }
    this.versao++;
  }

  /** O jogador deixa de ter humano: volta a ser bot, parado, com o nome de bot. */
  private soltar(slot: number): void {
    const j = this.p.jogador(slot);
    if (!j) return;
    const v = j.vaga;
    v.humano = false;
    delete v.idControle;
    v.nome = v.nomeBot ?? v.nome;
    j.ausente = false;
    j.cmd = comandoParado();
    j.acaoSeq = null;
    j.chute = { apertado: false, comBola: false, desde: 0 };
    j.passe = { apertado: false, comBola: false, desde: 0 };
    j.cerebro.proximaDecisao = 0;
  }
}
