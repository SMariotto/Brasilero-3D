import {
  ACAO,
  BOTAO,
  CHUTE,
  CONTROLE,
  PASSE,
  anguloParaByte,
  codificarComando,
  magParaByte,
  type Comando,
} from "@b3d/core";

export interface FonteDoComando {
  /** Joystick: direção em radianos e força de 0 a 1. */
  joystick: { ang: number; mag: number };
  chuteApertado(): boolean;
  passeApertado(): boolean;
}

/**
 * Monta e manda o pacote de 7 bytes (PROTOCOLO 4):
 * - apertar ou soltar botão sai NA HORA (nunca perder a borda);
 * - só o joystick mudando sai no máximo 30 vezes por segundo, e só se o ângulo ou a força mudaram de verdade;
 * - sem mudança, repete o último pacote a cada 1 s ("estou aqui"; o `acaoSeq` igual impede o servidor de repetir a ação);
 * - a carga do chute e o tempo do PASSE são medidos aqui, no celular, para o atraso da rede não mudar a força.
 */
export class Envio {
  private acao: number = ACAO.nenhuma;
  private forca = 0;
  private acaoSeq = 0;
  private ultimoEnvio = 0;
  private ultimoAng = -1;
  private ultimoMag = -1;
  private timerGarganta: ReturnType<typeof setTimeout> | undefined;
  private timerPresenca: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly fonte: FonteDoComando,
    private readonly mandar: (dados: Uint8Array) => void,
  ) {}

  /** Começa a mandar (um pacote neutro já na hora, para o servidor ter a referência do `acaoSeq`). */
  iniciar(): void {
    this.parar();
    this.enviarAgora();
    this.timerPresenca = setInterval(() => {
      if (performance.now() - this.ultimoEnvio >= CONTROLE.envioPresencaS * 1000) this.enviarAgora();
    }, 250);
  }

  parar(): void {
    clearInterval(this.timerPresenca);
    clearTimeout(this.timerGarganta);
    this.timerGarganta = undefined;
  }

  /** O joystick mexeu: respeita o limite de 30 por segundo, mas o último movimento sempre acaba saindo. */
  joystickMudou(): void {
    const c = this.comandoAtual();
    if (c.ang === this.ultimoAng && c.mag === this.ultimoMag) return;
    const espera = 1000 / CONTROLE.envioJoystickMaxHz - (performance.now() - this.ultimoEnvio);
    if (espera <= 0) {
      this.enviarAgora();
    } else if (this.timerGarganta === undefined) {
      this.timerGarganta = setTimeout(() => {
        this.timerGarganta = undefined;
        const atual = this.comandoAtual();
        if (atual.ang !== this.ultimoAng || atual.mag !== this.ultimoMag) this.enviarAgora();
      }, espera);
    }
  }

  /** Apertou um botão: sai na hora. */
  botaoApertado(): void {
    this.enviarAgora();
  }

  /** Soltou CHUTE: a carga é o tempo segurado (0,8 s = 100%). */
  chuteSolto(duracaoMs: number): void {
    this.acao = ACAO.chute;
    this.forca = Math.round(Math.min(1, duracaoMs / 1000 / CHUTE.cargaTotalS) * 255);
    this.acaoSeq = (this.acaoSeq + 1) & 255;
    this.enviarAgora();
  }

  /** Soltou PASSE: toque rápido é passe rasteiro; segurar mais que 0,25 s é lançamento (força = tempo segurado até 1 s). */
  passeSolto(duracaoMs: number): void {
    const s = duracaoMs / 1000;
    if (s >= PASSE.lancamentoSegurarS) {
      this.acao = ACAO.passeSegurado;
      this.forca = Math.round(Math.min(1, s) * 255);
    } else {
      this.acao = ACAO.passeToque;
      this.forca = 0;
    }
    this.acaoSeq = (this.acaoSeq + 1) & 255;
    this.enviarAgora();
  }

  comandoAtual(): Comando {
    const f = this.fonte;
    return {
      ang: anguloParaByte(f.joystick.ang),
      mag: magParaByte(f.joystick.mag),
      seguros: (f.chuteApertado() ? BOTAO.chute : 0) | (f.passeApertado() ? BOTAO.passe : 0),
      acao: this.acao,
      forca: this.forca,
      acaoSeq: this.acaoSeq,
    };
  }

  enviarAgora(): void {
    const c = this.comandoAtual();
    this.ultimoAng = c.ang;
    this.ultimoMag = c.mag;
    this.ultimoEnvio = performance.now();
    this.mandar(codificarComando(c));
  }
}
