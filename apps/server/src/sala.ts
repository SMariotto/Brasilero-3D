import {
  CONFIG_PADRAO,
  PARTIDA,
  SERVIDOR,
  validarApelido,
  type CodigoErro,
  type Config,
  type JogadorLobby,
  type Lado,
  type Lobby,
  type MensagemCliente,
  type MensagemServidor,
} from "@b3d/core";

/** Por onde a sala fala com um aparelho. O servidor liga isto a um WebSocket; os testes usam um falso. */
export interface Canal {
  enviar(msg: MensagemServidor): void;
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
}

export interface Tela {
  canal: Canal;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; codigo: CodigoErro; msg: string };

const falha = (codigo: CodigoErro, msg: string): { ok: false; codigo: CodigoErro; msg: string } => ({ ok: false, codigo, msg });

/**
 * Uma sala: quem está nela, a configuração e o lobby. O jogo em si entra na F2.
 * O relógio (`agora`) é injetado para os testes poderem avançar o tempo.
 */
export class Sala {
  config: Config = { ...CONFIG_PADRAO };
  private jogadores: Jogador[] = []; // na ordem de entrada: o primeiro é o Dono
  private telas: Tela[] = []; // na ordem de entrada: o primeiro é o telão principal
  private proximoId = 0;
  private vazioDesde: number | null;

  constructor(
    readonly codigo: string,
    private readonly agora: () => number,
    private readonly gerarToken: () => string,
  ) {
    this.vazioDesde = agora();
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

  lobby(): Lobby {
    const jogadores: JogadorLobby[] = this.jogadores.map((j, i) => ({
      id: j.id,
      apelido: j.apelido,
      lado: j.lado,
      pronto: j.pronto,
      dono: i === 0,
      conectado: j.canal !== null,
    }));
    return { t: "lobby", sala: this.codigo, config: { ...this.config }, jogadores, telas: this.telas.length };
  }

  // --- entrada e saída ----------------------------------------------------

  entrarTela(canal: Canal): Resultado<Tela> {
    if (this.telas.length >= SERVIDOR.maxTelasPorSala) return falha("TELAS_CHEIAS", "Essa sala já tem telões demais.");
    const tela: Tela = { canal };
    this.telas.push(tela);
    this.atualizarVazio();
    canal.enviar({ t: "bemvindo", papel: "tela", sala: this.codigo, principal: this.telas[0] === tela });
    this.transmitirLobby();
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

    if (token !== undefined) {
      jogador = this.jogadores.find((j) => j.token === token);
      if (!jogador) return falha("TOKEN_EXPIRADO", "Sua vaga venceu. Entre de novo.");
      // Se o aparelho antigo ainda se achava conectado, ele perde a vez.
      if (jogador.canal && jogador.canal !== canal) jogador.canal.fechar(4002, "substituido");
      jogador.canal = canal;
      jogador.venceEm = null;
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
      };
      this.jogadores.push(jogador);
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
    return { ok: true, valor: jogador };
  }

  /** O aparelho caiu. A vaga fica guardada por `vagaGuardadaS`; depois disso o jogador sai da sala. */
  desconectarControle(jogador: Jogador, canal: Canal): void {
    if (jogador.canal !== canal) return; // já foi substituído por uma conexão nova
    jogador.canal = null;
    jogador.venceEm = this.agora() + PARTIDA.vagaGuardadaS * 1000;
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
        jogador.pronto = msg.valor;
        this.transmitirLobby();
        return;
      case "config":
        if (!this.ehDono(jogador)) return this.erro(canal, "SEM_PERMISSAO", "Só o Dono da sala muda isso.");
        this.aplicarConfig(canal, msg);
        return;
      case "comecar":
      case "revanche":
      case "lobby":
        if (!this.ehDono(jogador)) return this.erro(canal, "SEM_PERMISSAO", "Só o Dono da sala faz isso.");
        // O jogo começa na F2. Por enquanto o Dono só aperta o botão.
        return;
      case "camera":
        this.erro(canal, "SEM_PERMISSAO", "Isso é coisa do telão.");
        return;
      default:
        return; // `ola` repetido: ignora
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
    this.jogadores = this.jogadores.filter((j) => j.venceEm === null || t < j.venceEm);
    if (this.jogadores.length !== antes) this.transmitirLobby();
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
    if (nova.casa === nova.visitante) {
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

  private transmitirLobby(): void {
    const lobby = this.lobby();
    for (const t of this.telas) t.canal.enviar(lobby);
    for (const j of this.jogadores) j.canal?.enviar(lobby);
  }
}
