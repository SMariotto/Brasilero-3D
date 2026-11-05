import * as THREE from "three";
import { SEM_DOMINANTE, uniformesDaPartida, type Evento, type Fim, type PartidaMsg, type Snapshot } from "@b3d/core";
import { criarBola3D, type Bola3D } from "./bola";
import { CameraJogo } from "./camera";
import { criarCampo3D } from "./campo";
import { Hud } from "./hud";
import { Interpolador } from "./interpolacao";
import { Jogadores } from "./jogadores";

/**
 * A cena do jogo no telão: Three.js, a câmera, os jogadores, a bola e o placar em HTML.
 * Recebe os snapshots, interpola e desenha a cada quadro (ARQUITETURA 6).
 */
export class CenaJogo {
  private readonly hud: Hud;
  private readonly interp = new Interpolador();
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: CameraJogo | null = null;
  private jogadores: Jogadores | null = null;
  private bola: Bola3D | null = null;
  private partidaId = -1;
  private quadro = 0;
  private ultimo = 0;
  private primeiroQuadro = true;
  private readonly aoRedimensionar = (): void => this.ajustarTamanho();
  private readonly aoTeclar = (e: KeyboardEvent): void => {
    if (e.key === "c" || e.key === "C") this.alternarCamera();
  };

  constructor(
    private readonly host: HTMLElement,
    hudRaiz: HTMLElement,
  ) {
    this.hud = new Hud(hudRaiz);
  }

  /** Monta o campo, os jogadores e a bola para uma partida nova (ou revanche). */
  iniciar(p: PartidaMsg): void {
    // Mesmo `id`: é a mesma partida com o elenco mudado (humano entrou, saiu ou assumiu vaga de bot). Só refaz os jogadores.
    if (p.id === this.partidaId && this.scene && this.jogadores) {
      this.scene.remove(this.jogadores.grupo);
      this.jogadores = new Jogadores(p.elenco, uniformesDaPartida(p.config.casa, p.config.visitante));
      this.scene.add(this.jogadores.grupo);
      this.hud.atualizarElenco(p);
      return;
    }
    this.partidaId = p.id;
    this.interp.reiniciar();
    this.primeiroQuadro = true;
    this.hud.iniciar(p);
    this.hud.botaoCamera.onclick = () => this.alternarCamera();

    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.host.replaceChildren(this.renderer.domElement);
      } catch {
        this.host.textContent = "Este navegador não conseguiu abrir o 3D. O placar continua funcionando.";
      }
    }

    this.liberar();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1b2d);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x2f6b3a, 1.15));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(-20, 40, 25);
    scene.add(sol);

    scene.add(criarCampo3D(p.campo));
    this.jogadores = new Jogadores(p.elenco, uniformesDaPartida(p.config.casa, p.config.visitante));
    scene.add(this.jogadores.grupo);
    this.bola = criarBola3D();
    scene.add(this.bola.grupo);

    this.scene = scene;
    this.camera = new CameraJogo(p.campo);

    window.addEventListener("resize", this.aoRedimensionar);
    window.addEventListener("keydown", this.aoTeclar);
    this.ajustarTamanho();
    if (!this.quadro) {
      this.ultimo = performance.now();
      this.quadro = requestAnimationFrame(this.desenhar);
    }
  }

  receberSnapshot(s: Snapshot): void {
    this.interp.adicionar(s, performance.now());
  }

  evento(e: Evento): void {
    this.hud.evento(e);
  }

  fim(f: Fim): void {
    this.hud.mostrarFim(f);
  }

  alternarCamera(): void {
    this.camera?.alternar();
  }

  /** Para de desenhar e solta o que é pesado. */
  parar(): void {
    cancelAnimationFrame(this.quadro);
    this.quadro = 0;
    window.removeEventListener("resize", this.aoRedimensionar);
    window.removeEventListener("keydown", this.aoTeclar);
    this.hud.limpar();
    this.liberar();
    this.partidaId = -1;
    this.scene = null;
    this.camera = null;
    this.jogadores = null;
    this.bola = null;
  }

  /** Solta da memória da placa de vídeo o que a cena anterior usava. */
  private liberar(): void {
    this.scene?.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
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
    if (this.renderer) {
      this.renderer.domElement.style.width = "100%";
      this.renderer.domElement.style.height = "100%";
    }
    this.camera?.definirAspecto(w / h);
  }

  private readonly desenhar = (agora: number): void => {
    this.quadro = requestAnimationFrame(this.desenhar);
    const dt = Math.min(0.1, (agora - this.ultimo) / 1000);
    this.ultimo = agora;

    const a = this.interp.amostrar(agora);
    if (a) {
      this.hud.atualizar(a);
      this.bola?.atualizar(a.bola);
      this.jogadores?.atualizar(a.jogadores, a.dominante === SEM_DOMINANTE ? SEM_DOMINANTE : a.dominante);
      this.camera?.atualizar(dt, a.bola, a.jogadores, this.primeiroQuadro);
      this.primeiroQuadro = false;
    }
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera.camera);
  };
}
