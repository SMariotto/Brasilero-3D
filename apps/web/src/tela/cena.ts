import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FASE, SEM_DOMINANTE, aplicarDonos, uniformesDaPartida, type DonoDeSlot, type MiraDoPasse, type Evento, type Fim, type PartidaMsg, type Snapshot, type VagaElenco } from "@b3d/core";
import { criarBola3D, type Bola3D } from "./bola";
import { CameraJogo } from "./camera";
import { criarCampo3D, type Campo3D } from "./campo";
import { MedidorFps, PainelDebug } from "./desempenho";
import { criarEstadio, type Estadio } from "./estadio";
import { Hud } from "./hud";
import { Interpolador, type Amostra } from "./interpolacao";
import { Jogadores } from "./jogadores";
import { obterBoneco, prepararBoneco, type BonecoPronto } from "./boneco";
import { obterModelo, urlDoModelo, type ModeloBase } from "./modelo";
import { GravadorDeReplay, Reproducao } from "./replay";
import { RelogioPausavel } from "./relogio-pausavel";
import { idDoApelido, idsHumanos, proximoId, slotDoHumano } from "./seguir";

/** Quanto o GOOOL fica sozinho na tela antes de o replay começar. */
const ESPERA_REPLAY_MS = 1400;

/**
 * A cena do jogo no telão: Three.js, a câmera, os jogadores, a bola, o estádio e o placar em HTML.
 * Recebe os snapshots, interpola e desenha a cada quadro (ARQUITETURA 6). Faz também o replay do gol, o medidor de fps
 * e o modo leve (SPEC 7.3 e 7.4).
 */
/** `?capsula=1`: força as cápsulas no lugar do jogador feito por código (e do modelo GLB). */
const CAPSULA_FORCADA = (): boolean => new URLSearchParams(location.search).get("capsula") === "1";

export class CenaJogo {
  private readonly hud: Hud;
  private readonly interp = new Interpolador();
  private readonly gravador = new GravadorDeReplay();
  /** H7.3: a partida está pausada? O servidor não manda snapshot; o telão congela tudo que se mexe sozinho (animações, rede, torcida, replay). */
  private pausada = false;
  /** A hora do jogo: a do navegador menos o tempo pausado. O replay do gol e a espera de 1,4 s antes dele contam nela. */
  private readonly relogio = new RelogioPausavel();
  private readonly medidor = new MedidorFps(
    () => this.aplicarModoLeve(true),
    () => this.aplicarModoLeve(false),
  );
  private readonly debug: PainelDebug | null;

  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: CameraJogo | null = null;
  private campo: Campo3D | null = null;
  private estadio: Estadio | null = null;
  private jogadores: Jogadores | null = null;
  private modelo: ModeloBase | null = null;
  /** O boneco novo (rig-v1) desta partida: skins, cabelos e o corpo. `null` se não carregou (aí valem o jogador por código e as cápsulas). */
  private boneco: BonecoPronto | null = null;
  private bola: Bola3D | null = null;
  private sol: THREE.DirectionalLight | null = null;

  private partidaId = -1;
  private elenco: VagaElenco[] = [];
  /** Id do controle do humano que a câmera segue (F8b), ou `null`. O jogador dele muda durante a partida (G1). */
  private seguindo: number | null = null;
  /** O último `donos` recebido, para aplicar ao elenco quando a partida (assíncrona) terminar de montar. */
  private ultimosDonos: DonoDeSlot[] | null = null;
  private quadro = 0;
  private quadros = 0;
  private ultimo = 0;
  private primeiroQuadro = true;
  private reproducao: Reproducao | null = null;
  private golPendente: { tick: number; lado: 1 | -1; quandoMs: number } | null = null;

  private readonly aoRedimensionar = (): void => this.ajustarTamanho();
  /** H7.4a: com o menu da partida aberto as teclas de câmera (C, N, L) ficam desligadas. */
  private teclasLigadas = true;
  private readonly aoTeclar = (e: KeyboardEvent): void => {
    if (!this.teclasLigadas) return;
    if (e.key === "c" || e.key === "C") this.alternarCamera();
    else if (e.key === "n" || e.key === "N") this.seguirProximo();
    else if (e.key === "l" || e.key === "L") this.medidor.alternar();
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly hudRaiz: HTMLElement,
  ) {
    this.hud = new Hud(hudRaiz);
    this.debug = new URLSearchParams(location.search).get("debug") === "1" ? new PainelDebug() : null;
  }

  /** Monta o campo, o estádio, os jogadores e a bola para uma partida nova (ou revanche). */
  async iniciar(p: PartidaMsg): Promise<void> {
    // Mesmo `id`: é a mesma partida com o elenco mudado (humano entrou, saiu ou assumiu vaga de bot). Só refaz os jogadores.
    if (p.id === this.partidaId && this.scene && this.jogadores) {
      this.scene.remove(this.jogadores.grupo);
      this.jogadores.liberar();
      this.jogadores = new Jogadores(p.elenco, uniformesDaPartida(p.config.casa, p.config.visitante), this.modelo, !CAPSULA_FORCADA(), this.boneco);
      this.jogadores.definirLeve(this.medidor.leve);
      this.scene.add(this.jogadores.grupo);
      this.hud.atualizarElenco(p);
      this.elenco = p.elenco;
      this.ultimosDonos = null; // o elenco que veio já é o de agora
      this.mostrarSeguindo();
      return;
    }
    // O boneco novo (rig-v1) e o modelo 3D antigo (se existirem) baixam uma vez; sem eles, valem o jogador por código e as cápsulas
    this.ultimosDonos = null;
    this.boneco?.liberar();
    this.boneco = null;
    const corpoDoBoneco = CAPSULA_FORCADA() ? null : await obterBoneco(import.meta.env.BASE_URL);
    if (corpoDoBoneco) this.boneco = await prepararBoneco(corpoDoBoneco, p.elenco, uniformesDaPartida(p.config.casa, p.config.visitante), [p.config.casa, p.config.visitante]);
    this.modelo = this.boneco ? null : await obterModelo(urlDoModelo(location.search, import.meta.env.BASE_URL));
    // `donos` que chegaram enquanto o modelo baixava valem sobre o elenco da mensagem `partida` (que é anterior a eles)
    if (this.ultimosDonos) p = { ...p, elenco: aplicarDonos(p.elenco, this.ultimosDonos) };
    this.partidaId = p.id;
    this.interp.reiniciar();
    if (this.pausada) this.interp.pausar(); // o `reiniciar` tira o modo pausado: quem entra (ou recarrega) com a sala pausada continua parado
    this.gravador.reiniciar();
    this.reproducao = null;
    this.golPendente = null;
    this.primeiroQuadro = true;
    this.hud.iniciar(p);
    this.hud.botaoCamera.onclick = () => this.alternarCamera();
    this.hud.botaoLeve.onclick = () => this.medidor.alternar();
    this.hud.modoLeve(this.medidor.leve);
    if (this.debug) this.hudRaiz.append(this.debug.elemento);

    if (!this.renderer) {
      try {
        const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        r.shadowMap.enabled = !this.medidor.leve;
        r.shadowMap.type = THREE.PCFShadowMap;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.05;
        r.info.autoReset = false; // contamos os desenhos do quadro inteiro, inclusive o pós-processamento
        this.renderer = r;
        this.host.replaceChildren(r.domElement);
      } catch {
        this.host.textContent = "Este navegador não conseguiu abrir o 3D. O placar continua funcionando.";
      }
    }

    this.jogadores?.liberar();
    this.liberar();
    const scene = new THREE.Scene();
    const uniformes = uniformesDaPartida(p.config.casa, p.config.visitante);

    // Luz de transmissão: céu e chão suaves e um "sol" forte de refletor que faz as sombras
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a5a33, 0.95));
    const sol = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sol.position.set(-25, 55, 32);
    const mx = p.campo.comp / 2 + 12;
    const mz = p.campo.larg / 2 + 12;
    Object.assign(sol.shadow.camera, { left: -mx, right: mx, top: mz, bottom: -mz, near: 10, far: 140 });
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.03;
    sol.castShadow = !this.medidor.leve;
    scene.add(sol);
    this.sol = sol;

    this.campo = criarCampo3D(p.campo);
    scene.add(this.campo.grupo);
    this.estadio = criarEstadio(p.campo, [uniformes[0].cor1, uniformes[1].cor1]);
    this.estadio.torcida.definirVisivel(!this.medidor.leve);
    scene.add(this.estadio.grupo);
    scene.background = this.estadio.ceu;
    scene.fog = new THREE.Fog(0x0d1a33, 95, 280);

    this.jogadores = new Jogadores(p.elenco, uniformes, this.modelo, !CAPSULA_FORCADA(), this.boneco);
    this.jogadores.definirLeve(this.medidor.leve);
    scene.add(this.jogadores.grupo);
    this.bola = criarBola3D();
    scene.add(this.bola.grupo);

    this.scene = scene;
    this.camera = new CameraJogo(p.campo);
    this.elenco = p.elenco;
    // `tela.html?segue=Apelido`: este telão já abre seguindo aquele jogador (por exemplo, o telão do amigo que está de longe)
    this.seguindo = null;
    const queroSeguir = new URLSearchParams(location.search).get("segue");
    const idPedido = queroSeguir ? idDoApelido(p.elenco, queroSeguir) : null;
    if (idPedido !== null) {
      this.seguindo = idPedido;
      this.camera.definirModo("jogador");
    }
    this.mostrarSeguindo();
    this.montarPosProcessamento();

    window.addEventListener("resize", this.aoRedimensionar);
    window.addEventListener("keydown", this.aoTeclar);
    this.ajustarTamanho();
    if (!this.quadro) {
      this.ultimo = performance.now();
      this.quadro = requestAnimationFrame(this.desenhar);
    }
  }

  /** Liga ou desliga as teclas de câmera e de modo leve (C, N, L). O menu da partida desliga enquanto está aberto (H7.4a). */
  definirTeclas(ligadas: boolean): void {
    this.teclasLigadas = ligadas;
  }

  /**
   * H7.3: a partida foi pausada (`true`) ou retomada (`false`), pelo `lobby.pausada`. Pode ser chamada a cada `lobby`: só age quando muda.
   * Pausada, o interpolador mostra o último snapshot parado (sem seguir a bola); ao retomar ele reancora o relógio (sem soquinhos nem voltar
   * no tempo). O quadro passa a andar com `dt` zero nos jogadores, na rede do gol e na torcida, e o replay do gol congela junto.
   */
  definirPausa(pausada: boolean): void {
    if (pausada === this.pausada) return;
    this.pausada = pausada;
    const agora = performance.now();
    if (pausada) {
      this.interp.pausar();
      this.relogio.pausar(agora);
    } else {
      this.interp.retomar();
      this.relogio.retomar(agora);
    }
  }

  receberSnapshot(s: Snapshot): void {
    this.interp.adicionar(s, performance.now());
    this.gravador.capturar(s);
  }

  /** Mensagem `donos` (G1): quem controla qual jogador mudou. Atualiza o elenco, as setas e os nomes. */
  donos(donos: DonoDeSlot[]): void {
    this.ultimosDonos = donos;
    this.elenco = aplicarDonos(this.elenco, donos);
    this.jogadores?.definirDonos(donos);
    this.hud.definirElenco(this.elenco);
    this.mostrarSeguindo();
  }

  /** Mensagem `mira` (H1): quem está mirando um passe e para quem. */
  mira(miras: MiraDoPasse[]): void {
    this.jogadores?.definirMiras(miras);
  }

  evento(e: Evento): void {
    this.hud.evento(e);
    if (e.tipo === "gol") {
      const lado: 1 | -1 = e.dados.time === 0 ? 1 : -1; // a Casa marca no gol de X positivo
      this.campo?.balancarRede(lado);
      this.estadio?.torcida.pular(4);
      this.golPendente = { tick: e.tick, lado, quandoMs: this.relogio.jogo(performance.now()) + ESPERA_REPLAY_MS };
    }
  }

  fim(f: Fim): void {
    this.terminarReplay();
    this.golPendente = null;
    this.hud.mostrarFim(f);
  }

  alternarCamera(): void {
    if (this.reproducao) return; // no replay a câmera é a de trás do gol
    if (!this.camera) return;
    const humanos = idsHumanos(this.elenco);
    if (this.camera.modo === "aerea" && humanos.length > 0 && this.seguindo === null) this.seguindo = proximoId(humanos, null);
    this.camera.alternar(humanos.length > 0);
    this.mostrarSeguindo();
  }

  /** Tecla N: passa a seguir o próximo jogador humano (e liga a câmera que segue, se não estava ligada). */
  seguirProximo(): void {
    if (this.reproducao || !this.camera) return;
    const humanos = idsHumanos(this.elenco);
    if (humanos.length === 0) return;
    this.seguindo = proximoId(humanos, this.seguindo);
    this.camera.definirModo("jogador");
    this.mostrarSeguindo();
  }

  private mostrarSeguindo(): void {
    const nome = this.camera?.modo === "jogador" ? this.elenco.find((v) => v.humano && v.idControle === this.seguindo)?.nome : undefined;
    this.hud.seguindo(nome ?? null);
  }

  /** Para de desenhar e solta o que é pesado. */
  parar(): void {
    this.definirPausa(false); // a pausa era da partida que acabou: a próxima começa rodando
    cancelAnimationFrame(this.quadro);
    this.quadro = 0;
    window.removeEventListener("resize", this.aoRedimensionar);
    window.removeEventListener("keydown", this.aoTeclar);
    this.hud.limpar();
    this.liberar();
    this.partidaId = -1;
    this.scene = null;
    this.camera = null;
    this.campo = null;
    this.estadio = null;
    this.jogadores = null;
    this.boneco?.liberar();
    this.boneco = null;
    this.bola = null;
    this.reproducao = null;
    this.golPendente = null;
  }

  // --- pós-processamento e modo leve ------------------------------------------------------------

  /** Brilho leve nos refletores (Bloom). Se der erro, o jogo segue sem. */
  private montarPosProcessamento(): void {
    this.composer?.dispose();
    this.composer = null;
    if (!this.renderer || !this.scene || !this.camera) return;
    try {
      const c = new EffectComposer(this.renderer);
      c.addPass(new RenderPass(this.scene, this.camera.camera));
      c.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.55, 0.92));
      c.addPass(new OutputPass());
      this.composer = c;
    } catch {
      this.composer = null;
    }
  }

  /** Modo leve (SPEC 7.3): sem sombras, sem torcida 3D e sem pós-processamento. */
  private aplicarModoLeve(leve: boolean): void {
    this.hud.modoLeve(leve);
    if (this.renderer) {
      this.renderer.shadowMap.enabled = !leve;
      this.renderer.setPixelRatio(leve ? 1 : Math.min(window.devicePixelRatio, 2));
    }
    if (this.sol) this.sol.castShadow = !leve;
    this.estadio?.torcida.definirVisivel(!leve);
    this.jogadores?.definirLeve(leve); // o modo leve volta para as cápsulas
    // Trocar sombras liga e desliga trechos do shader: os materiais precisam recompilar
    this.scene?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
    this.ajustarTamanho();
  }

  // --- replay -------------------------------------------------------------------------------------

  private iniciarReplay(agora: number): void {
    const gol = this.golPendente;
    this.golPendente = null;
    if (!gol || !this.camera) return;
    const r = new Reproducao(this.gravador.trecho(gol.tick), agora, gol.lado);
    if (r.vazia) return;
    this.reproducao = r;
    this.camera.iniciarReplay(gol.lado);
    this.hud.replay(true);
  }

  private terminarReplay(): void {
    if (!this.reproducao) return;
    this.reproducao = null;
    this.camera?.terminarReplay();
    this.hud.replay(false);
  }

  // --- quadro ---------------------------------------------------------------------------------------

  /** Solta da memória da placa de vídeo o que a cena anterior usava. */
  private liberar(): void {
    this.scene?.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Points) {
        if (!(o instanceof THREE.Sprite)) o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        for (const mat of Array.isArray(m) ? m : [m]) {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          mat.dispose();
        }
      }
    });
  }

  private ajustarTamanho(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer?.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (this.renderer) {
      this.renderer.domElement.style.width = "100%";
      this.renderer.domElement.style.height = "100%";
    }
    this.camera?.definirAspecto(w / h);
  }

  private readonly desenhar = (agora: number): void => {
    this.quadro = requestAnimationFrame(this.desenhar);
    const dtMs = agora - this.ultimo;
    this.ultimo = agora;
    const dt = Math.min(0.1, dtMs / 1000);
    const estado = this.medidor.quadro(dtMs);
    this.renderer?.info.reset();

    // H7.3: pausado, o que se mexe sozinho (animação do boneco, rede do gol, torcida) anda com dt zero, e o replay conta em hora de jogo
    const dtJogo = this.pausada ? 0 : dt;
    const agoraJogo = this.relogio.jogo(agora);
    this.campo?.atualizar(dtJogo);
    this.estadio?.torcida.atualizar(dtJogo);

    // O jogo ao vivo continua sendo medido mesmo durante o replay (placar, relógio, fim do replay)
    const vivo = this.interp.amostrar(agora);
    if (this.golPendente && agoraJogo >= this.golPendente.quandoMs && !this.reproducao) this.iniciarReplay(agoraJogo);
    if (this.reproducao && (this.reproducao.terminou(agoraJogo) || (vivo && vivo.fase !== FASE.gol))) this.terminarReplay();

    const a: Amostra | null = this.reproducao ? this.reproducao.amostrar(agoraJogo) : vivo;
    if (vivo) this.hud.atualizar(vivo);
    if (a) {
      this.bola?.atualizar(a.bola);
      this.jogadores?.atualizar(a.jogadores, a.dominante === SEM_DOMINANTE ? SEM_DOMINANTE : a.dominante, dtJogo, a.bola);
      const slotSeguido = this.seguindo === null ? null : slotDoHumano(this.elenco, this.seguindo);
      const seguido = slotSeguido === null ? undefined : a.jogadores.find((j) => j.slot === slotSeguido);
      this.camera?.atualizar(dt, a.bola, a.jogadores, this.primeiroQuadro, seguido ? { x: seguido.x, z: seguido.z } : null);
      this.primeiroQuadro = false;
    }

    if (this.renderer && this.scene && this.camera) {
      if (this.composer && !estado.leve) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera.camera);
    }

    if (this.debug && this.renderer && ++this.quadros % 10 === 0) {
      const i = this.renderer.info;
      this.debug.atualizar({
        fps: estado.fps,
        leve: estado.leve,
        motivo: this.medidor.motivo,
        chamadas: i.render.calls,
        triangulos: i.render.triangles,
        geometrias: i.memory.geometries,
        texturas: i.memory.textures,
        atrasoMs: this.interp.atrasoMs,
      });
    }
  };
}
