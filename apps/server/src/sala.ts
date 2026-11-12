import { timingSafeEqual } from "node:crypto";
import {
  Campeonato,
  resultadoDaPartida,
  CLUBE_ALEATORIO,
  CONFIG_PADRAO,
  MENU,
  PARTIDA,
  SERVIDOR,
  TEMPO,
  Partida,
  codificarSnapshot,
  coresDaPartida,
  criarRng,
  sortearClubes,
  decodificarComando,
  validarApelido,
  type CodigoErro,
  type Config,
  type JogadorLobby,
  type Lado,
  type Lobby,
  type MensagemCliente,
  type MensagemServidor,
  type PartidaMsg,
  type Voce,
  type VagaElenco,
} from "@b3d/core";

/** Por onde a sala fala com um aparelho. O servidor liga isto a um WebSocket; os testes usam um falso. */
export interface Canal {
  enviar(msg: MensagemServidor): void;
  enviarBinario(dados: Uint8Array): void;
  fechar(codigo?: number, motivo?: string): void;
}

export interface Jogador {
  id: number;
  apelido: string;
  lado: Lado;
  pronto: boolean;
  token: string;
  /** `null` enquanto o aparelho está desconectado (a vaga fica guardada). */
  canal: Canal | null;
  /** Hora (ms) em que a vaga guardada vence; `null` se está conectado. */
  venceEm: number | null;
  /**
   * O jogador que ele controla AGORA na partida (G1: muda com passes e trocas). Espelho do que a partida diz, atualizado pela sala.
   * `null` no lobby, se entrou depois de a partida começar, ou enquanto caiu da conexão.
   */
  slot: number | null;
  /** O time dele na partida (fixo até o fim dela). `null` no lobby ou se está em espera. */
  time: 0 | 1 | null;
  /** Última mensagem `voce` mandada (texto) e quando, para mandar só quando muda (no máximo 10 por segundo). */
  ultimoVoce: string;
  ultimoVoceEm: number;
  /**
   * H7.2: o identificador que o navegador do celular mandou no `ola` (o último, se ele voltou com outro). Nunca sai da sala: serve só
   * para bloquear o aparelho se o jogador for expulso. `null` se o celular não mandou.
   */
  aparelho: string | null;
}

export interface Tela {
  canal: Canal;
  /**
   * H7: este telão é "o PC": o que criou a sala, ou outro que apresentou a chave dela (recarregou a página, caiu e voltou, outra aba do
   * mesmo PC). O mestre pode agir (ver `tratarTela`); os outros telões, como os dos amigos que digitaram o código, só assistem.
   */
  mestre: boolean;
}

/** Como o telão entra: `criou` (acabou de criar a sala) ou com a `chave` guardada no navegador do PC. */
export interface EntradaDoTelao {
  criou?: boolean;
  chave?: string;
}

/** Compara duas chaves sem deixar o tempo da resposta dizer quantas letras acertou. */
function chavesIguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; codigo: CodigoErro; msg: string };

const falha = (codigo: CodigoErro, msg: string): { ok: false; codigo: CodigoErro; msg: string } => ({ ok: false, codigo, msg });

/** Quanto dura um passo de física, em ms. */
const PASSO_MS = 1000 / TEMPO.tickHz;

export interface OpcoesSala {
  /** Sorteia a semente de cada partida. Os testes trocam por algo fixo. */
  semente?: () => number;
  /** Só testes: não completa o elenco com bots e goleiros (1 contra 1 puro). */
  semBots?: boolean;
  /**
   * Sorteia a chave do telão mestre (H7), quando o telão cria a sala. Sem isto usa o gerador de tokens, na hora de criar (para os tokens
   * `token0`, `token1`... dos testes, que não criam telão, não mudarem).
   */
  gerarChave?: () => string;
}

/** Por que a liderança mudou de mãos (H7), para o texto do aviso. */
type MotivoDoLider = "pc" | "passou" | "saiu";

/**
 * Uma sala: quem está nela, a configuração, o lobby e a partida em andamento.
 * O relógio (`agora`) é injetado para os testes poderem avançar o tempo.
 */
export class Sala {
  config: Config = { ...CONFIG_PADRAO };
  partida: Partida | null = null;
  private jogadores: Jogador[] = []; // na ordem de entrada (o mais antigo primeiro)
  private telas: Tela[] = []; // na ordem de entrada: o primeiro é o telão principal
  /**
   * H7: o líder da sala (o "Dono" até a H6, que era só o primeiro da lista). O primeiro controle a entrar é o líder provisório; o PC
   * (telão mestre) ou o próprio líder passam a liderança; `null` = sem líder (a vaga dele venceu) até alguém ser escolhido.
   */
  private liderId: number | null = null;
  /** Hora (`agora()`) em que a sala ficou sem líder com celular conectado e o PC mestre presente: o prazo de `MENU.liderAutoEscolheAposS` corre daqui. */
  private semLiderDesde: number | null = null;
  /** A chave do telão mestre (H7). `null` até um telão criar a sala. Nunca sai em `lobby`: só no `bemvindo` de quem criou. */
  private chaveDoTelao: string | null = null;
  private readonly gerarChave: () => string;
  /**
   * H7.3: a partida está pausada, e quem pausou. Enquanto isso o laço não roda nenhum passo (nada se mexe, o relógio da partida não anda,
   * não sai snapshot); a vaga guardada de quem cai continua correndo em hora real. A pausa do PC só o PC retoma; a do líder, os dois.
   */
  private pausada: { por: "lider" | "tela" } | null = null;
  /** H7.2: os aparelhos expulsos. Ficam bloqueados nesta sala até ela fechar (a lista some junto com a sala). */
  private readonly bloqueados = new Set<string>();
  private proximoId = 0;
  private vazioDesde: number | null;
  private cores: [string, string] = ["#C8102E", "#006437"];
  private mensagemPartida: PartidaMsg | null = null;
  private partidaId = 0;
  private clubesSorteados: { casa: string; visitante: string } | null = null;
  private fimEnviado = false;
  /** A última \`versaoControle\` da partida que os aparelhos já receberam (mensagem \`donos\`). */
  private versaoControleEnviada = 0;
  /** As últimas miras de passe mandadas (texto), para só mandar `mira` quando mudam (H1). */
  private ultimaMira = "[]";
  /** Tabela e estatísticas das partidas desta sala (só na memória; some quando a sala fecha). */
  readonly campeonato = new Campeonato();
  private relogioAnterior: number | null = null;
  private acumulado = 0;
  private readonly semente: () => number;
  private readonly semBots: boolean;

  constructor(
    readonly codigo: string,
    private readonly agora: () => number,
    private readonly gerarToken: () => string,
    opcoes: OpcoesSala = {},
  ) {
    this.vazioDesde = agora();
    this.semente = opcoes.semente ?? (() => Math.floor(Math.random() * 2 ** 32));
    this.semBots = opcoes.semBots ?? false;
    this.gerarChave = opcoes.gerarChave ?? (() => this.gerarToken());
  }

  // --- consulta -----------------------------------------------------------

  get quantidadeJogadores(): number {
    return this.jogadores.length;
  }

  get quantidadeTelas(): number {
    return this.telas.length;
  }

  /** Conexões abertas agora (telões e controles). */
  get conexoes(): number {
    return this.telas.length + this.jogadores.filter((j) => j.canal).length;
  }

  /** O id do líder da sala (o nome vem de quando era o "Dono"), ou `null` se a sala está sem líder. */
  donoId(): number | null {
    return this.liderId;
  }

  /** A sala está esperando o PC escolher o novo líder (com o prazo correndo)? */
  get esperandoLider(): boolean {
    return this.semLiderDesde !== null;
  }

  jogadorPorId(id: number): Jogador | undefined {
    return this.jogadores.find((j) => j.id === id);
  }

  lobby(): Lobby {
    const jogadores: JogadorLobby[] = this.jogadores.map((j) => ({
      id: j.id,
      apelido: j.apelido,
      lado: j.lado,
      pronto: j.pronto,
      dono: j.id === this.liderId,
      conectado: j.canal !== null,
    }));
    return {
      t: "lobby",
      sala: this.codigo,
      config: { ...this.config },
      jogadores,
      telas: this.telas.length,
      emPartida: this.partida !== null,
      pausada: this.pausada !== null,
      ...(this.pausada ? { pausadaPor: this.pausada.por } : {}),
    };
  }

  // --- entrada e saída ----------------------------------------------------

  /**
   * Entra um telão. `criou`: acabou de criar a sala: é o mestre e recebe a chave (que o navegador dele guarda). Com a `chave` certa
   * (H7): é o mestre de novo, mesmo recarregando a página; dois telões com a chave certa são mestres ao mesmo tempo. Sem chave, ou com
   * a errada, só assiste (e não fica sabendo se a chave existe).
   */
  entrarTela(canal: Canal, entrada: EntradaDoTelao = {}): Resultado<Tela> {
    if (this.telas.length >= SERVIDOR.maxTelasPorSala) return falha("TELAS_CHEIAS", "Essa sala já tem telões demais.");
    let mestre = false;
    let chaveNova: string | undefined;
    if (entrada.criou === true) {
      this.chaveDoTelao ??= this.gerarChave();
      mestre = true;
      chaveNova = this.chaveDoTelao;
    } else if (entrada.chave !== undefined && this.chaveDoTelao !== null) {
      mestre = chavesIguais(entrada.chave, this.chaveDoTelao);
    }
    const tela: Tela = { canal, mestre };
    this.telas.push(tela);
    this.atualizarVazio();
    canal.enviar({ t: "bemvindo", papel: "tela", sala: this.codigo, principal: this.telas[0] === tela, mestre, ...(chaveNova !== undefined ? { chave: chaveNova } : {}) });
    this.transmitirLobby();
    this.reenviarPartida(canal);
    if (this.campeonato.partidas > 0) canal.enviar(this.campeonato.mensagem());
    return { ok: true, valor: tela };
  }

  sairTela(tela: Tela): void {
    const i = this.telas.indexOf(tela);
    if (i < 0) return;
    this.telas.splice(i, 1);
    this.atualizarVazio();
    // O telão mais antigo que sobrou vira o principal.
    if (i === 0) this.telas[0]?.canal.enviar({ t: "principal", valor: true });
    this.transmitirLobby();
  }

  /**
   * Entra um controle. Com `token` válido volta para o mesmo jogador (a vaga guardada); sem token, vira jogador novo.
   * Token que não existe mais (a vaga venceu) dá `TOKEN_EXPIRADO` e o aparelho pode tentar de novo sem token.
   */
  entrarControle(canal: Canal, apelido: unknown, token?: string, aparelho?: string): Resultado<Jogador> {
    let jogador: Jogador | undefined;
    let assumiuVaga = false;

    // H7.2: aparelho expulso não entra, nem com token (o token dele já foi apagado) nem sem. Vem antes de tudo.
    if (aparelho !== undefined && this.bloqueados.has(aparelho)) return falha("EXPULSO", "Você foi removido da sala.");

    if (token !== undefined) {
      jogador = this.jogadores.find((j) => j.token === token);
      if (!jogador) return falha("TOKEN_EXPIRADO", "Sua vaga venceu. Entre de novo.");
      // Se o aparelho antigo ainda se achava conectado, ele perde a vez.
      if (jogador.canal && jogador.canal !== canal) jogador.canal.fechar(4002, "substituido");
      jogador.canal = canal;
      jogador.venceEm = null;
      jogador.ultimoVoce = "";
      if (aparelho !== undefined) jogador.aparelho = aparelho; // se voltou com outro, o bloqueio vale para o de agora
      if (jogador.time !== null) {
        this.partida?.definirAusenteHumano(jogador.id, false);
        this.aposMudancaDeControle();
      }
    } else {
      const limpo = validarApelido(apelido);
      if (limpo === null) return falha("APELIDO_INVALIDO", `Escolha um apelido de 1 a 12 letras.`);
      if (this.jogadores.length >= SERVIDOR.maxControlesPorSala) {
        return falha("SALA_CHEIA", `Essa sala já tem ${SERVIDOR.maxControlesPorSala} controles. Quem sobrar assiste pelo telão.`);
      }
      jogador = {
        id: this.proximoId++,
        apelido: limpo,
        lado: "tanto",
        pronto: false,
        token: this.gerarToken(),
        canal,
        venceEm: null,
        slot: null,
        time: null,
        ultimoVoce: "",
        ultimoVoceEm: 0,
        aparelho: aparelho ?? null,
      };
      this.jogadores.push(jogador);
      // O primeiro controle da sala é o líder provisório. Se a sala está esperando o PC escolher o novo líder, o recém-chegado não assume.
      if (this.liderId === null && this.semLiderDesde === null) this.liderId = jogador.id;
      assumiuVaga = this.assumirVagaNoMeio(jogador);
    }

    this.atualizarVazio();
    canal.enviar({
      t: "bemvindo",
      papel: "controle",
      sala: this.codigo,
      id: jogador.id,
      token: jogador.token,
      dono: this.liderId === jogador.id,
    });
    this.transmitirLobby();
    if (this.campeonato.partidas > 0) canal.enviar(this.campeonato.mensagem());
    if (assumiuVaga) {
      // Entrou no lugar de um bot: todo mundo recebe o elenco novo (a mesma partida, com o `id` de antes).
      this.elencoMudou();
      jogador.ultimoVoce = "";
      this.enviarVoz(jogador, true);
    } else {
      this.reenviarPartida(canal, jogador);
    }
    return { ok: true, valor: jogador };
  }

  /** O aparelho caiu. A vaga fica guardada por `vagaGuardadaS`; depois disso o jogador sai da sala. */
  desconectarControle(jogador: Jogador, canal: Canal): void {
    if (jogador.canal !== canal) return; // já foi substituído por uma conexão nova
    jogador.canal = null;
    jogador.venceEm = this.agora() + PARTIDA.vagaGuardadaS * 1000;
    if (jogador.time !== null) {
      this.partida?.definirAusenteHumano(jogador.id, true);
      this.aposMudancaDeControle();
    }
    this.atualizarVazio();
    this.transmitirLobby();
  }

  // --- mensagens de quem já entrou ---------------------------------------

  /**
   * Mensagem de um telão. O telão que só assiste manda `camera` e mais nada. O telão mestre (o PC, H7) também passa a liderança
   * (`lider`), expulsa (`expulsar`, H7.2), pausa e retoma (`pausa`, H7.3) e faz tudo que o líder faz na gestão da sala (`config`, `comecar`, `revanche`, `lobby`, `zerar`): o PC tem a última palavra.
   * O resto (`lado`, `pronto`...) é de quem joga. Recusar não fecha a conexão: manda um erro que não é fatal.
   */
  tratarTela(tela: Tela, msg: MensagemCliente): void {
    if (msg.t === "camera") return;
    if (tela.mestre) {
      if (msg.t === "lider") return this.passarLideranca(tela.canal, msg.id, null);
      if (msg.t === "expulsar") return this.expulsar(tela.canal, msg.id, null);
      if (msg.t === "pausa") return this.definirPausa(tela.canal, msg.valor, "tela");
      if (this.gerir(tela.canal, msg)) return;
    }
    this.erro(tela.canal, "SEM_PERMISSAO", "O telão só observa.");
  }

  tratarControle(jogador: Jogador, msg: MensagemCliente): void {
    const canal = jogador.canal;
    if (!canal) return;

    switch (msg.t) {
      case "lado": {
        if (this.partida) return this.erro(canal, "MENSAGEM_INVALIDA", "A partida está rolando.");
        if (msg.lado === jogador.lado) return;
        if (msg.lado !== "tanto") {
          const ocupadas = this.jogadores.filter((j) => j !== jogador && j.lado === msg.lado).length;
          if (ocupadas >= PARTIDA.maxHumanosPorTime) {
            this.erro(canal, "LADO_CHEIO", `Esse lado já tem ${PARTIDA.maxHumanosPorTime} jogadores.`);
            return;
          }
        }
        jogador.lado = msg.lado;
        this.transmitirLobby();
        return;
      }
      case "pronto":
        if (this.partida) return this.erro(canal, "MENSAGEM_INVALIDA", "A partida está rolando.");
        jogador.pronto = msg.valor;
        this.transmitirLobby();
        return;
      case "config":
      case "comecar":
      case "revanche":
      case "lobby":
      case "zerar":
        if (!this.ehLider(jogador)) return this.negarSemLider(canal, msg.t === "config" ? "muda isso" : "faz isso");
        this.gerir(canal, msg);
        return;
      case "lider":
        if (!this.ehLider(jogador)) return this.negarSemLider(canal, "passa a liderança");
        this.passarLideranca(canal, msg.id, jogador);
        return;
      case "expulsar":
        if (!this.ehLider(jogador)) return this.negarSemLider(canal, "expulsa");
        this.expulsar(canal, msg.id, jogador);
        return;
      case "pausa":
        if (!this.ehLider(jogador)) return this.negarSemLider(canal, "pausa o jogo");
        this.definirPausa(canal, msg.valor, "lider");
        return;
      case "camera":
        this.erro(canal, "SEM_PERMISSAO", "Isso é coisa do telão.");
        return;
      default:
        return; // `ola` repetido: ignora
    }
  }

  /** Comando binário de um controle (PROTOCOLO 4). Comando quebrado ou de quem não está jogando é ignorado. */
  comandoControle(jogador: Jogador, dados: Uint8Array): void {
    if (!this.partida || jogador.time === null) return;
    const cmd = decodificarComando(dados);
    if (cmd) this.partida.definirComandoDoHumano(jogador.id, cmd); // vale para o jogador que ele controla agora (G1)
  }

  // --- partida --------------------------------------------------------------

  /** Monta o elenco com quem está na sala: cada humano vai para o lado escolhido; "tanto faz" equilibra. */
  private montarElenco(): { elenco: VagaElenco[]; n: Config["n"] } {
    const lados = new Map<Jogador, 0 | 1>();
    const contagem: [number, number] = [0, 0];
    for (const j of this.jogadores) {
      if (j.lado === "casa") {
        lados.set(j, 0);
        contagem[0]++;
      } else if (j.lado === "visitante") {
        lados.set(j, 1);
        contagem[1]++;
      }
    }
    for (const j of this.jogadores) {
      if (j.lado !== "tanto") continue;
      const time: 0 | 1 = contagem[0] <= contagem[1] ? 0 : 1;
      lados.set(j, time);
      contagem[time]++;
    }

    const proximo: [number, number] = [0, 0];
    const elenco: VagaElenco[] = [];
    for (const j of this.jogadores) {
      const time = lados.get(j)!;
      const i = proximo[time]++;
      // Casa usa os slots 0 a 5 (0 é o goleiro) e o Visitante 6 a 11 (6 é o goleiro).
      const slot = time * 6 + 1 + i;
      j.slot = slot;
      j.time = time;
      elenco.push({ slot, time, numero: 7 + i, nome: j.apelido, humano: true, idControle: j.id, goleiro: false });
    }

    // Cada time tem no máximo 3 humanos (PARTIDA.maxHumanosPorTime), que cabem em qualquer N (3, 4 ou 5): N é o que o líder escolheu.
    return { elenco, n: this.config.n };
  }

  /** Começa uma partida (ou a revanche) com o modo que o líder escolheu. Os bots completam as vagas. */
  private comecar(revanche: boolean): void {
    const { elenco, n } = this.montarElenco();
    const semente = this.semente();
    // "Aleatório" vira clubes de verdade ao começar; na revanche ficam os mesmos clubes da partida anterior.
    const sorteados = revanche && this.clubesSorteados ? { ...this.config, ...this.clubesSorteados } : sortearClubes(this.config, criarRng(semente ^ 0x9e3779b9));
    this.clubesSorteados = { casa: sorteados.casa, visitante: sorteados.visitante };
    const config: Config = { ...sorteados, n };
    this.cores = coresDaPartida(config.casa, config.visitante);
    this.partida = new Partida({ config, elenco, semente, semBots: this.semBots, controleFifa: true });
    this.versaoControleEnviada = this.partida.versaoControle;
    this.ultimaMira = "[]";
    this.partidaId++;
    this.fimEnviado = false;
    this.pausada = null;
    this.relogioAnterior = null;
    this.acumulado = 0;

    this.mensagemPartida = this.montarMensagemPartida();

    for (const j of this.jogadores) {
      j.pronto = false;
      j.ultimoVoce = "";
    }
    this.transmitir(this.mensagemPartida);
    this.transmitirLobby();
    this.enviarVoces(true);
  }

  /** A mensagem `partida` com o elenco de agora (humanos e bots). */
  private montarMensagemPartida(): PartidaMsg {
    const p = this.partida!;
    return {
      t: "partida",
      id: this.partidaId,
      config: p.config,
      campo: {
        comp: p.campo.comp,
        larg: p.campo.larg,
        golLarg: p.campo.golLarg,
        golAlt: p.campo.golAlt,
        areaComp: p.campo.areaProf,
        areaLarg: p.campo.areaLarg,
        paredes: p.campo.paredes,
      },
      elenco: p.elenco.map((v) => ({ ...v })),
      cores: this.cores,
      tickHz: TEMPO.tickHz,
      snapHz: TEMPO.snapHz,
      tick0: 0,
    };
  }

  /** O elenco mudou no meio do jogo (humano assumiu vaga de bot, ou a vaga dele venceu): manda a lista nova a todos. */
  private elencoMudou(): void {
    if (!this.partida) return;
    this.mensagemPartida = this.montarMensagemPartida();
    this.transmitir(this.mensagemPartida);
  }

  /** Quem entra com a partida rolando assume o lugar de um bot do time com menos humanos (SPEC 4.1). */
  private assumirVagaNoMeio(jogador: Jogador): boolean {
    const p = this.partida;
    if (!p || p.terminou) return false;
    const humanos: [number, number] = [p.controle.quantidade(0), p.controle.quantidade(1)];
    const preferido: 0 | 1 = humanos[0] <= humanos[1] ? 0 : 1;
    const vaga = p.promoverHumano(preferido, jogador.apelido, jogador.id) ?? p.promoverHumano(preferido === 0 ? 1 : 0, jogador.apelido, jogador.id);
    if (!vaga) return false; // só humanos nos dois times: fica em espera até a próxima partida
    jogador.slot = vaga.slot;
    jogador.time = vaga.time;
    return true;
  }

  private voltarAoLobby(): void {
    this.partida = null;
    this.mensagemPartida = null;
    this.pausada = null; // a pausa era da partida que acabou
    this.relogioAnterior = null;
    this.acumulado = 0;
    for (const j of this.jogadores) {
      j.slot = null;
      j.time = null;
    }
    this.transmitirLobby();
  }

  /** Quem entra ou reconecta com a partida rolando recebe o elenco, o seu estado e, se já acabou, o resultado. */
  private reenviarPartida(canal: Canal, jogador?: Jogador): void {
    if (!this.partida || !this.mensagemPartida) return;
    this.mensagemPartida = this.montarMensagemPartida(); // o elenco de agora (quem controla quem muda durante o jogo)
    canal.enviar(this.mensagemPartida);
    if (jogador) {
      jogador.ultimoVoce = "";
      this.enviarVoz(jogador, true);
    }
    if (this.partida.terminou) {
      canal.enviar(this.partida.resumo());
      if (!jogador) canal.enviarBinario(codificarSnapshot(this.partida.snapshot()));
    } else if (this.pausada && !jogador) {
      // H7.3: com a sala pausada ninguém manda snapshot; sem este o telão que entra (ou recarrega) veria o campo vazio
      canal.enviarBinario(codificarSnapshot(this.partida.snapshot()));
    }
  }

  /**
   * Chamada pelo laço do servidor (a cada ~8 ms): roda quantos passos de 1/60 s o tempo real pede (no máximo 5 por volta,
   * para não espiralar se o PC engasgar) e devolve o tempo do passo mais lento, em ms.
   */
  avancar(): number {
    const p = this.partida;
    if (!p || p.terminou || this.pausada) {
      this.relogioAnterior = null;
      return 0;
    }
    const t = this.agora();
    if (this.relogioAnterior === null) {
      this.relogioAnterior = t;
      return 0;
    }
    this.acumulado += t - this.relogioAnterior;
    this.relogioAnterior = t;

    let pior = 0;
    let passos = 0;
    while (this.acumulado >= PASSO_MS && passos < TEMPO.maxPassosPorVolta && !p.terminou) {
      const inicio = performance.now();
      this.passoUnico();
      pior = Math.max(pior, performance.now() - inicio);
      this.acumulado -= PASSO_MS;
      passos++;
    }
    if (this.acumulado >= PASSO_MS) this.acumulado %= PASSO_MS; // atrasou demais: joga fora o resto em vez de acelerar o jogo
    return pior;
  }

  /** Um passo de 1/60 s: física, eventos, e a cada 2 passos o snapshot e o `voce`. Público para os testes. */
  passoUnico(): void {
    const p = this.partida;
    if (!p || this.pausada) return;
    p.passo();
    // Quem controla quem mudou (passe, troca...): avisa antes dos eventos deste passo, para o nome do gol sair certo
    if (p.versaoControle !== this.versaoControleEnviada) this.aposMudancaDeControle();
    for (const e of p.eventosPendentes()) this.transmitir({ t: "evento", ...e });

    const hora = p.tick % (TEMPO.tickHz / TEMPO.snapHz) === 0;
    if (hora || p.terminou) {
      this.enviarMiras();
      const bytes = codificarSnapshot(p.snapshot());
      for (const tela of this.telas) tela.canal.enviarBinario(bytes);
      this.enviarVoces(false);
    }
    if (p.terminou && !this.fimEnviado) {
      this.fimEnviado = true;
      this.transmitir(p.resumo());
      this.campeonato.registrar(resultadoDaPartida(p));
      this.transmitir(this.campeonato.mensagem());
    }
  }

  /** Só para a rota de teste do servidor: põe o jogador de um controle e a bola em lugares conhecidos. */
  posicionarParaTeste(idControle: number, x: number, z: number, bolaX: number, bolaZ: number, dir = 0): boolean {
    const j = this.jogadorPorId(idControle);
    if (!this.partida || !j || j.slot === null) return false;
    this.partida.posicionarParaTeste(j.slot, x, z, bolaX, bolaZ, dir);
    return true;
  }

  private enviarVoces(forcar: boolean): void {
    for (const j of this.jogadores) this.enviarVoz(j, forcar);
  }

  /** Manda a lista de miras de passe (quem receberia o passe de quem está com PASSE apertado) quando ela muda (H1). */
  private enviarMiras(): void {
    const p = this.partida;
    if (!p) return;
    const miras = p.terminou ? [] : p.miras();
    const texto = JSON.stringify(miras);
    if (texto === this.ultimaMira) return;
    this.ultimaMira = texto;
    this.transmitir({ t: "mira", miras });
  }

  /** Copia da partida para cada jogador o jogador que ele controla agora. */
  private sincronizarSlots(): void {
    const p = this.partida;
    if (!p) return;
    for (const j of this.jogadores) if (j.time !== null) j.slot = p.slotDoHumano(j.id);
  }

  /** O controle mudou de mãos: atualiza os espelhos, avisa todos (`donos`) e manda a cada celular o jogador novo dele. */
  private aposMudancaDeControle(): void {
    const p = this.partida;
    if (!p) return;
    this.versaoControleEnviada = p.versaoControle;
    this.sincronizarSlots();
    this.transmitir({ t: "donos", donos: p.donos() });
    this.enviarVoces(true);
  }

  /** `voce`: só quando muda e no máximo 10 vezes por segundo, mais um a cada 1 s (PROTOCOLO 3). */
  private enviarVoz(j: Jogador, forcar: boolean): void {
    const canal = j.canal;
    const p = this.partida;
    if (!canal || !p) return;

    let msg: Voce;
    if (j.time === null) {
      msg = { t: "voce", slot: -1, time: 0, numero: 0, cor: "#888888", comBola: false, situacao: "espera" };
    } else if (j.slot === null) {
      return; // voltou da queda e ainda não recebeu um jogador (sai no próximo passo)
    } else {
      const estado = p.estadoDe(j.slot);
      const vaga = p.jogador(j.slot)?.vaga;
      if (!estado || !vaga) return;
      msg = {
        t: "voce",
        slot: j.slot,
        time: j.time,
        numero: vaga.numero,
        cor: this.cores[j.time],
        comBola: estado.comBola,
        situacao: estado.situacao,
      };
    }

    const texto = JSON.stringify(msg);
    const t = this.agora();
    const mudou = texto !== j.ultimoVoce;
    if (forcar || (mudou && t - j.ultimoVoceEm >= 100) || t - j.ultimoVoceEm >= 1000) {
      j.ultimoVoce = texto;
      j.ultimoVoceEm = t;
      canal.enviar(msg);
    }
  }

  // --- manutenção ---------------------------------------------------------

  /**
   * Chamada a cada segundo pelo servidor: vence as vagas guardadas que passaram do prazo
   * (se era o líder, ver `cuidarDoLider`: o PC escolhe o novo, ou o celular conectado mais antigo assume).
   * Devolve `true` se a sala ficou sem nenhuma conexão por `salaVaziaApagaAposS` e pode ser apagada.
   */
  varrer(): boolean {
    const t = this.agora();
    const antes = this.jogadores.length;
    const vencidos = this.jogadores.filter((j) => j.venceEm !== null && t >= j.venceEm);
    this.jogadores = this.jogadores.filter((j) => j.venceEm === null || t < j.venceEm);
    if (this.jogadores.length !== antes) {
      // A vaga venceu de vez: na partida, o bot que jogava por ele passa a ser o dono do lugar.
      for (const j of vencidos) if (j.time !== null) this.partida?.removerHumano(j.id);
      if (vencidos.some((j) => j.time !== null)) {
        this.aposMudancaDeControle();
        this.elencoMudou();
      }
      if (vencidos.some((j) => j.id === this.liderId)) this.liderId = null; // o novo vem de `cuidarDoLider`, logo abaixo
      this.cuidarDoLider(t);
      this.transmitirLobby();
    } else if (this.cuidarDoLider(t)) {
      this.transmitirLobby();
    }
    return this.vazioDesde !== null && t - this.vazioDesde >= SERVIDOR.salaVaziaApagaAposS * 1000;
  }

  /** Fecha todas as conexões (usado quando a sala é apagada). */
  encerrar(): void {
    for (const t of this.telas) t.canal.fechar(4004, "sala encerrada");
    for (const j of this.jogadores) j.canal?.fechar(4004, "sala encerrada");
  }

  // --- internos -----------------------------------------------------------

  private ehLider(jogador: Jogador): boolean {
    return this.liderId === jogador.id;
  }

  /** Recusa uma ação de líder: "só o líder faz isso", ou "a sala está sem líder" enquanto o PC não escolhe o novo. */
  private negarSemLider(canal: Canal, oQue: string): void {
    this.erro(canal, "SEM_PERMISSAO", this.liderId === null ? "A sala está sem líder." : `Só o líder da sala ${oQue}.`);
  }

  /**
   * As ações de gestão da sala (config, começar, revanche, voltar ao lobby, zerar o campeonato). Quem pode já foi conferido: o líder
   * pelo celular ou o telão mestre pelo PC. Devolve `false` se a mensagem não é uma delas.
   */
  private gerir(canal: Canal, msg: MensagemCliente): boolean {
    switch (msg.t) {
      case "config":
        if (this.partida) this.erro(canal, "MENSAGEM_INVALIDA", "A partida está rolando.");
        else this.aplicarConfig(canal, msg);
        return true;
      case "comecar":
        if (!this.partida) this.comecar(false);
        return true;
      case "revanche":
        if (this.partida?.terminou) this.comecar(true);
        return true;
      case "lobby":
        this.voltarAoLobby();
        return true;
      case "zerar":
        this.campeonato.zerar();
        this.transmitir(this.campeonato.mensagem());
        return true;
      default:
        return false;
    }
  }

  /**
   * `lider` (H7): passa a liderança ao jogador `id`. `por` é o líder que passa, ou `null` quando é o telão mestre (o PC). O alvo precisa
   * estar na sala e conectado. Passar a quem já é o líder não faz nada (nem erro nem aviso).
   */
  private passarLideranca(canal: Canal, id: number, por: Jogador | null): void {
    const alvo = this.jogadorPorId(id);
    if (!alvo || alvo.canal === null) return this.erro(canal, "ALVO_INVALIDO", "Esse jogador não está na sala ou está sem sinal.");
    if (alvo.id === this.liderId) return;
    this.definirLider(alvo, por === null ? "pc" : "passou", por?.apelido);
    this.transmitirLobby();
  }

  /**
   * `pausa` (H7.3): pausa (`valor: true`) ou retoma (`false`) a partida. Quem pode já foi conferido: o líder pelo celular (`por: "lider"`) ou
   * o telão mestre pelo PC (`por: "tela"`).
   *  - Sem partida rolando, ou com a partida acabada (tela de fim), não há o que pausar: ignora, sem erro.
   *  - Pausar o que já está pausado, ou retomar o que não está, não faz nada (nem erro, nem `lobby` repetido).
   *  - O PC tem a última palavra: pausa do PC só o PC retoma (o líder recebe `PAUSA_DO_TELAO`); pausa do líder, os dois retomam.
   * Ao pausar sai um último snapshot (quem vê o jogo parado precisa dele) e o `lobby` com `pausada`. Ao retomar a partida descarta o que
   * foi apertado com o jogo parado (`Partida.aoRetomar`) e o relógio do laço recomeça do zero, sem "recuperar" o tempo parado.
   */
  private definirPausa(canal: Canal, valor: boolean, por: "lider" | "tela"): void {
    const p = this.partida;
    if (!p || p.terminou) return;
    if (valor) {
      if (this.pausada) return;
      this.pausada = { por };
      this.relogioAnterior = null;
      this.acumulado = 0;
      const bytes = codificarSnapshot(p.snapshot());
      for (const t of this.telas) t.canal.enviarBinario(bytes);
      this.transmitirLobby();
      return;
    }
    if (!this.pausada) return;
    if (this.pausada.por === "tela" && por === "lider") {
      this.erro(canal, "PAUSA_DO_TELAO", "O PC pausou o jogo; só ele retoma.");
      return;
    }
    this.pausada = null;
    this.relogioAnterior = null;
    this.acumulado = 0;
    p.aoRetomar();
    this.transmitirLobby();
  }

  /**
   * `expulsar` (H7.2): tira o controle `id` da sala e bloqueia o aparelho dele até a sala fechar. `por` é o líder que expulsa, ou `null`
   * quando é o telão mestre (o PC). Vale no lobby e na partida, e para quem está sem sinal (libera a vaga sem esperar os 30 s).
   * O líder não se expulsa. Expulsar o líder deixa a sala sem líder (vale o prazo de `cuidarDoLider`).
   *
   * Na partida o jogador que ele controlava vira bot na hora, no lugar onde está (a mesma saída de `varrer` quando a vaga vence).
   */
  private expulsar(canal: Canal, id: number, por: Jogador | null): void {
    const alvo = this.jogadorPorId(id);
    if (!alvo) return this.erro(canal, "ALVO_INVALIDO", "Esse jogador não está mais na sala.");
    if (por !== null && alvo.id === por.id) return this.erro(canal, "SEM_PERMISSAO", "Você não pode expulsar a si mesmo.");

    // O `close` que o servidor recebe depois de fechar a conexão chama `desconectarControle`, que só age se `jogador.canal` for o mesmo
    // canal: soltar o canal antes de fechar faz esse `close` não valer nada (o jogador já saiu da lista).
    const canalDele = alvo.canal;
    alvo.canal = null;
    if (alvo.aparelho !== null) this.bloqueados.add(alvo.aparelho);
    this.jogadores = this.jogadores.filter((j) => j !== alvo);

    if (alvo.time !== null) this.partida?.removerHumano(alvo.id);
    if (this.liderId === alvo.id) this.liderId = null; // o novo vem de `cuidarDoLider`, logo abaixo

    canalDele?.enviar({ t: "erro", codigo: "EXPULSO", msg: "Você foi removido da sala." });
    canalDele?.fechar(4005, "expulso");

    if (alvo.time !== null) {
      this.aposMudancaDeControle();
      this.elencoMudou();
    }
    this.transmitir({ t: "aviso", texto: `Removido da sala: ${alvo.apelido}.` });
    this.cuidarDoLider(this.agora()); // se era o líder, o aviso "sem líder" vem depois do de quem saiu
    this.atualizarVazio();
    this.transmitirLobby();
  }

  /**
   * Põe `novo` como líder e avisa todo mundo na tela quem virou líder e por quê (H7). Não manda o `lobby`: quem chama manda.
   * O novo líder recebe um aviso só dele ("Você é o líder agora").
   */
  private definirLider(novo: Jogador, motivo: MotivoDoLider, quemPassou?: string): void {
    this.liderId = novo.id;
    this.semLiderDesde = null;
    const porque =
      motivo === "pc" ? "escolhido pelo PC" : motivo === "passou" ? `${quemPassou ?? "o líder"} passou a liderança` : "o líder anterior saiu da sala";
    const paraTodos: MensagemServidor = { t: "aviso", texto: `${novo.apelido} agora é o líder (${porque}).` };
    const paraONovo: MensagemServidor = { t: "aviso", texto: `Você é o líder agora (${porque}).` };
    for (const t of this.telas) t.canal.enviar(paraTodos);
    for (const j of this.jogadores) j.canal?.enviar(j === novo ? paraONovo : paraTodos);
  }

  /**
   * Chamada a cada segundo por `varrer`: a sala sem líder (a vaga dele venceu) precisa de um novo. Com o PC mestre conectado, ele tem
   * `MENU.liderAutoEscolheAposS` para escolher (a sala avisa a todos); passado o prazo, ou sem PC mestre, o celular conectado mais
   * antigo assume. Sem nenhum celular conectado, espera: o próximo que entrar vira o líder provisório. Devolve `true` se algo mudou.
   */
  private cuidarDoLider(agora: number): boolean {
    if (this.liderId !== null) return false;
    const candidatos = this.jogadores.filter((j) => j.canal !== null);
    if (candidatos.length === 0) {
      const mudou = this.semLiderDesde !== null;
      this.semLiderDesde = null;
      return mudou;
    }
    const haMestre = this.telas.some((t) => t.mestre);
    if (haMestre && this.semLiderDesde === null) {
      this.semLiderDesde = agora;
      this.transmitir({ t: "aviso", texto: `O líder saiu da sala. O PC escolhe o novo líder; em ${MENU.liderAutoEscolheAposS} s o mais antigo assume.` });
      return true;
    }
    if (!haMestre || agora - (this.semLiderDesde ?? agora) >= MENU.liderAutoEscolheAposS * 1000) {
      this.definirLider(candidatos[0]!, "saiu");
      return true;
    }
    return false;
  }

  private aplicarConfig(canal: Canal, msg: Extract<MensagemCliente, { t: "config" }>): void {
    const { t: _t, ...mudancas } = msg;
    const nova: Config = { ...this.config, ...mudancas };

    // Escolher para um lado o clube que está no outro troca os dois de lugar.
    if (nova.casa === nova.visitante && nova.casa !== CLUBE_ALEATORIO) {
      if ("casa" in mudancas && "visitante" in mudancas) {
        this.erro(canal, "MENSAGEM_INVALIDA", "Escolha dois clubes diferentes.");
        return;
      }
      if ("casa" in mudancas) nova.visitante = this.config.casa;
      else nova.casa = this.config.visitante;
    }

    this.config = nova;
    this.transmitirLobby();
  }

  private atualizarVazio(): void {
    if (this.conexoes === 0) this.vazioDesde ??= this.agora();
    else this.vazioDesde = null;
  }

  private erro(canal: Canal, codigo: CodigoErro, msg: string): void {
    canal.enviar({ t: "erro", codigo, msg });
  }

  private transmitir(msg: MensagemServidor): void {
    for (const t of this.telas) t.canal.enviar(msg);
    for (const j of this.jogadores) j.canal?.enviar(msg);
  }

  private transmitirLobby(): void {
    this.transmitir(this.lobby());
  }
}
