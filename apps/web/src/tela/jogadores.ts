import * as THREE from "three";
import { ANIM, JOGADOR, PARTIDA, SEM_DOMINANTE, type JogadorSnap, type UniformeResolvido, type VagaElenco } from "@b3d/core";
import { criarMaterialUniforme } from "./uniforme";
import { FiguraModelo, type ModeloBase } from "./modelo";

/** Etiqueta com o apelido, desenhada num canvas e usada como sprite (sempre virada para a câmera). */
function etiqueta(nome: string, cor: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;
  const g = canvas.getContext("2d")!;
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 10;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(nome, 160, 42);
  g.fillStyle = "#ffffff";
  g.fillText(nome, 160, 42);
  g.fillStyle = cor;
  g.fillRect(40, 70, 240, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(3.6, 0.9, 1);
  s.renderOrder = 10;
  return s;
}

/** Número de camisa pequeno em cima dos bots (os humanos têm o apelido). */
function etiquetaNumero(numero: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.font = "bold 46px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 9;
  g.strokeStyle = "rgba(0,0,0,0.8)";
  g.strokeText(String(numero), 64, 34);
  g.fillStyle = "#ffffff";
  g.fillText(String(numero), 64, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(1.3, 0.65, 1);
  s.renderOrder = 9;
  return s;
}

interface Figura {
  grupo: THREE.Group;
  /** A cápsula (reserva). Fica `null` quando o modelo 3D está em uso. */
  corpo: THREE.Mesh | null;
  /** O modelo 3D animado, se o `jogador.glb` carregou. */
  modelo: FiguraModelo | null;
  /** Apelido em cima do jogador (só humanos). Fica fora do grupo para não girar com o corpo. */
  rotulo: THREE.Sprite | null;
}

/**
 * Os jogadores: o modelo 3D animado do `jogador.glb` quando ele existe (F6) ou cápsulas na cor do time (reserva), com apelido
 * e seta em cima dos humanos e um anel no chão sob quem está com a bola.
 */
export class Jogadores {
  readonly grupo = new THREE.Group();
  private readonly figuras = new Map<number, Figura>();
  private readonly anel: THREE.Mesh;

  constructor(elenco: VagaElenco[], uniformes: [UniformeResolvido, UniformeResolvido], modelo: ModeloBase | null = null) {
    const alturaTronco = JOGADOR.alturaCorpo - JOGADOR.raio * 2;

    for (const v of elenco) {
      // Goleiros usam uma cor fixa de contraste (SPEC 9.3); o resto, a cor do time
      const cor = v.goleiro ? (v.time === 0 ? PARTIDA.corGoleiroCasa : PARTIDA.corGoleiroVisitante) : uniformes[v.time].cor1;
      const uniforme: UniformeResolvido = v.goleiro ? { padrao: "liso", cor1: cor, cor2: cor, calcao: "#111111", meiao: cor } : uniformes[v.time];
      const grupo = new THREE.Group();

      let corpo: THREE.Mesh | null = null;
      let figuraModelo: FiguraModelo | null = null;
      if (modelo) {
        figuraModelo = new FiguraModelo(modelo, uniforme);
        grupo.add(figuraModelo.raiz);
      } else {
        corpo = new THREE.Mesh(new THREE.CapsuleGeometry(JOGADOR.raio, alturaTronco, 4, 14), criarMaterialUniforme(uniforme));
        corpo.position.y = JOGADOR.alturaCorpo / 2;
        corpo.castShadow = true;
        grupo.add(corpo);

        // "Nariz": mostra para onde o corpo olha
        const nariz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        nariz.position.set(JOGADOR.raio, JOGADOR.alturaCorpo * 0.72, 0);
        grupo.add(nariz);
      }

      let rotulo: THREE.Sprite | null = null;
      if (v.humano) {
        const seta = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(cor) }));
        seta.rotation.x = Math.PI; // ponta para baixo
        seta.position.y = JOGADOR.alturaCorpo + 0.55;
        seta.name = "seta";
        grupo.add(seta);
        rotulo = etiqueta(v.nome, cor);
        this.grupo.add(rotulo);
      } else if (!v.goleiro) {
        rotulo = etiquetaNumero(v.numero);
        this.grupo.add(rotulo);
      }

      this.grupo.add(grupo);
      this.figuras.set(v.slot, { grupo, corpo, modelo: figuraModelo, rotulo });
    }

    this.anel = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.anel.rotation.x = -Math.PI / 2;
    this.anel.position.y = 0.04;
    this.anel.visible = false;
    this.grupo.add(this.anel);
  }

  /** Pose da cápsula: em pé (inclinando na corrida), deitada (caído), deslizando (carrinho) ou mergulhando (goleiro). */
  private pose(f: Figura, j: Omit<JogadorSnap, "dir"> & { dir: number }): void {
    const c = f.corpo;
    if (!c) return;
    c.rotation.set(0, 0, 0);
    c.scale.y = 1;
    c.position.y = JOGADOR.alturaCorpo / 2;
    if (j.anim === ANIM.carrinho) {
      c.rotation.z = -1.25; // deitado para a frente, deslizando
      c.position.y = JOGADOR.raio + 0.1;
    } else if (j.caido || j.anim === ANIM.queda) {
      c.rotation.z = -Math.PI / 2;
      c.position.y = JOGADOR.raio;
    } else if (j.anim === ANIM.goleiroMergulhoEsq || j.anim === ANIM.goleiroMergulhoDir) {
      c.rotation.x = j.anim === ANIM.goleiroMergulhoEsq ? -1.3 : 1.3;
      c.position.y = 0.8;
    } else {
      c.rotation.z = -Math.min(0.28, j.vel * 0.04); // inclina para a frente conforme a velocidade
      c.scale.y = j.arrancando ? 0.94 : 1;
    }
  }

  /** Solta o que o modelo animado prendeu (mixers). A cena chama ao trocar de partida ou de elenco. */
  liberar(): void {
    for (const f of this.figuras.values()) f.modelo?.liberar();
  }

  atualizar(jogadores: Array<Omit<JogadorSnap, "dir"> & { dir: number }>, dominante: number, dtS = 0): void {
    this.anel.visible = false;
    for (const j of jogadores) {
      const f = this.figuras.get(j.slot);
      if (!f) continue;
      f.grupo.position.set(j.x, 0, j.z);
      f.grupo.rotation.y = -j.dir; // dirX = cos, dirZ = sin: girar +X para +Z é no sentido horário visto de cima
      this.pose(f, j);
      f.modelo?.atualizar(j.anim, j.vel, dtS);

      f.rotulo?.position.set(j.x, JOGADOR.alturaCorpo + (j.humano ? 1.35 : 0.75), j.z);

      if (j.slot === dominante && dominante !== SEM_DOMINANTE) {
        this.anel.visible = true;
        this.anel.position.x = j.x;
        this.anel.position.z = j.z;
        this.anel.scale.setScalar(1 + j.carga * 0.6);
        (this.anel.material as THREE.MeshBasicMaterial).color.set(j.carga > 0.02 ? 0xff7043 : 0xffd54a);
      }
    }
  }
}
