import {
  CLUBE_ALEATORIO,
  CONFIG_PADRAO,
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
  /** Vaga na partida em andamento. `null` no lobby, ou se entrou depois de a partida começar. */
  slot: number | null;
  time: 0 | 1 | null;
  /** Última mensagem `voce` mandada (texto) e quando, para mandar só quando muda (no máximo 10 por segundo). */
  ultimoVoce: string;
  ultimoVoceEm: number;
}

export interface Tela {
  canal: Canal;
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
}

/**
 * Uma sala: quem está nela, a configuração, o lobby e a partida em andamento.
 * O relógio (`agora`) é injetado para os testes poderem avançar o tempo.
 */
export class Sala {
  config: Config = { ...CONFIG_PADRAO };
  partida: Partida | null = null;
  private jogadores: Jogador[] = []; // na ordem de entrada: o primeiro é o Dono
  private telas: Tela[] = []; // na ordem de entrada: o primeiro é o telão principal
  private proximoId = 0;
  private vazioDesde: number | null;
  private cores: [string, string] = ["#C8102E", "#006437"];
  private mensagemPartida: PartidaMsg | null = null;
  private partidaId = 0;
  private clubesSorteados: { casa: string; visitante: string } | null = null;
  private fimEnviado = false;
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

  donoId(): number | null {
    return this.jogadores[0]?.id ?? null;
  }

  jogadorPorId(id: number): Jogador | undefined {
    return this.jogadores.find((j) => j.id === id);
  }

  lobby(): Lobby {
    const jogadores: JogadorLobby[] = this.jogadores.map((j, i) => ({
      id: j.id,
      apelido: j.apelido,
      lado: j.lado,
      pronto: j.pronto,
      dono: i === 0,
      conectado: j.canal !== null,
    }));
    return {
      t: "lobby",
      sala: this.codigo,
      config: { ...this.config },
      jogadores,
      telas: this.telas.length,
      emPartida: this.partida !== null,
    };
  }

  // --- entrada e saída ----------------------------------------------------

  entrarTela(canal: Canal): Resultado<Tela> {
    if (this.telas.length >= SERVIDOR.maxTelasPorSala) return falha("TELAS_CHEIAS", "Essa sala já tem telões demais.");
    const tela: Tela = { canal };
    this.telas.push(tela);
    this.atualizarVazio();
    canal.enviar({ t: "bemvindo", papel: "tela", sala: this.codigo, principal: this.telas[0] === tela });
    this.transmitirLobby();
    this.reenviarPartida(canal);
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
  entrarControle(canal: Canal, apelido: unknown, token?: string): Resultado<Jogador> {
    let jogador: Jogador | undefined;
    let assumiuVaga = false;

    if (token !== undefined) {
      jogador = this.jogadores.find((j) => j.token === token);
      if (!jogador) return falha("TOKEN_EXPIRADO", "Sua vaga venceu. Entre de novo.");
      // Se o aparelho antigo ainda se achava conectado, ele perde a vez.
      if (jogador.canal && jogador.canal !== canal) jogador.canal.fechar(4002, "substituido");
      jogador.canal = canal;
      jogador.venceEm = null;
      jogador.ultimoVoce = "";
      if (jogador.slot !== null) this.partida?.definirAusente(jogador.slot, false);
    } else {
      const limpo = validarApelido(apelido);
      if (limpo === null) return falha("APELIDO_INVALIDO", `Escolha um apelido de 1 a 12 letras.`);
      if (this.jogadores.length >= SERVIDOR.maxControlesPorSala) return falha("SALA_CHEIA", "Essa sala já tem 10 controles.");
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
      };
      this.jogadores.push(jogador);
      assumiuVaga = this.assumirVagaNoMeio(jogador);
    }

    this.atualizarVazio();
    canal.enviar({
      t: "bemvindo",
      papel: "controle",
      sala: this.codigo,
      id: jogador.id,
      token: jogador.token,
      dono: this.jogadores[0] === jogador,
    });
    this.transmitirLobby();
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
    if (jogador.slot !== null) this.partida?.definirAusente(jogador.slot, true);
    this.atualizarVazio();
    this.transmitirLobby();
  }

  // --- mensagens de quem já entrou ---------------------------------------

  /** Mensagem de um telão. Telão só observa; o resto é do controle. */
  tratarTela(tela: Tela, msg: MensagemCliente): void {
    if (msg.t === "camera") return;
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
          if (ocupadas >= PARTIDA.maxHumanosPorLado) {
            this.erro(canal, "LADO_CHEIO", "Esse lado já tem 5 jogadores.");
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
        if (!this.ehDono(jogador)) return this.erro(canal, "SEM_PERMISSAO", "Só o Dono da sala muda isso.");
        if (this.partida) return this.erro(canal, "MENSAGEM_INVALIDA", "A partida está rolando.");
        this.aplicarConfig(canal, msg);
        return;
      case "comecar":
        if (!this.ehDono(jogador)) return this.erro(canal, "SEM_PERMISSAO", "Só o Dono da sala faz isso.");
        if (!this.partida) this.comecar(false);
        return;
      case "revanche":
        if (!this.ehDono(jogador)) return this.erro(canal, "SEM_PERMISSAO", "Só o Dono da sala faz isso.");
        if (this.partida?.terminou) this.comecar(true);
        return;
      case "lobby":
        if (!this.ehDono(jogador)) return this.erro(canal, "SEM_PERMISSAO", "Só o Dono da sala faz isso.");
        this.voltarAoLobby();
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
    if (!this.partida || jogador.slot === null) return;
    const cmd = decodificarComando(dados);
    if (cmd) this.partida.definirComando(jogador.slot, cmd);
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

    // Se um time tem mais humanos que N, N sobe até o máximo de 5 (SPEC 4.1).
    const n = Math.min(PARTIDA.nLinhaMax, Math.max(this.config.n, contagem[0], contagem[1])) as Config["n"];
    return { elenco, n };
  }

  /** Começa uma partida (ou a revanche) com o modo que o Dono escolheu. Os bots completam as vagas. */
  private comecar(revanche: boolean): void {
    const { elenco, n } = this.montarElenco();
    const semente = this.semente();
    // "Aleatório" vira clubes de verdade ao começar; na revanche ficam os mesmos clubes da partida anterior.
    const sorteados = revanche && this.clubesSorteados ? { ...this.config, ...this.clubesSorteados } : sortearClubes(this.config, criarRng(semente ^ 0x9e3779b9));
    this.clubesSorteados = { casa: sorteados.casa, visitante: sorteados.visitante };
    const config: Config = { ...sorteados, n };
    this.cores = coresDaPartida(config.casa, config.visitante);
    this.partida = new Partida({ config, elenco, semente, semBots: this.semBots });
    this.partidaId++;
    this.fimEnviado = false;
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
    const humanos: [number, number] = [0, 0];
    for (const v of p.elenco) if (v.humano) humanos[v.time]++;
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
    for (const j of this.jogadores) {
      j.slot = null;
      j.time = null;
    }
    this.transmitirLobby();
  }

  /** Quem entra ou reconecta com a partida rolando recebe o elenco, o seu estado e, se já acabou, o resultado. */
  private reenviarPartida(canal: Canal, jogador?: Jogador): void {
    if (!this.partida || !this.mensagemPartida) return;
    canal.enviar(this.mensagemPartida);
    if (jogador) {
      jogador.ultimoVoce = "";
      this.enviarVoz(jogador, true);
    }
    if (this.partida.terminou) {
      canal.enviar(this.partida.resumo());
      if (!jogador) canal.enviarBinario(codificarSnapshot(this.partida.snapshot()));
    }
  }

  /**
   * Chamada pelo laço do servidor (a cada ~8 ms): roda quantos passos de 1/60 s o tempo real pede (no máximo 5 por volta,
   * para não espiralar se o PC engasgar) e devolve o tempo do passo mais lento, em ms.
   */
  avancar(): number {
    const p = this.partida;
    if (!p || p.terminou) {
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
    if (!p) return;
    p.passo();
    for (const e of p.eventosPendentes()) this.transmitir({ t: "evento", ...e });

    const hora = p.tick % (TEMPO.tickHz / TEMPO.snapHz) === 0;
    if (hora || p.terminou) {
      const bytes = codificarSnapshot(p.snapshot());
      for (const tela of this.telas) tela.canal.enviarBinario(bytes);
      this.enviarVoces(false);
    }
    if (p.terminou && !this.fimEnviado) {
      this.fimEnviado = true;
      this.transmitir(p.resumo());
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

  /** `voce`: só quando muda e no máximo 10 vezes por segundo, mais um a cada 1 s (PROTOCOLO 3). */
  private enviarVoz(j: Jogador, forcar: boolean): void {
    const canal = j.canal;
    const p = this.partida;
    if (!canal || !p) return;

    let msg: Voce;
    if (j.slot === null || j.time === null) {
      msg = { t: "voce", slot: -1, time: 0, numero: 0, cor: "#888888", comBola: false, energia: 0, situacao: "espera" };
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
        energia: estado.energia,
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
   * (se era o Dono, o próximo controle mais antigo vira Dono).
   * Devolve `true` se a sala ficou sem nenhuma conexão por `salaVaziaApagaAposS` e pode ser apagada.
   */
  varrer(): boolean {
    const t = this.agora();
    const antes = this.jogadores.length;
    const vencidos = this.jogadores.filter((j) => j.venceEm !== null && t >= j.venceEm);
    this.jogadores = this.jogadores.filter((j) => j.venceEm === null || t < j.venceEm);
    if (this.jogadores.length !== antes) {
      // A vaga venceu de vez: na partida, o bot que jogava por ele passa a ser o dono do lugar.
      for (const j of vencidos) if (j.slot !== null) this.partida?.liberarSlot(j.slot);
      if (vencidos.some((j) => j.slot !== null)) this.elencoMudou();
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

  private ehDono(jogador: Jogador): boolean {
    return this.jogadores[0] === jogador;
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
