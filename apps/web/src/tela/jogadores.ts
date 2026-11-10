import * as THREE from "three";
import { ANIM, JOGADOR, PARTIDA, SEM_DOMINANTE, donosDoElenco, type BolaSnap, type DonoDeSlot, type MiraDoPasse, type JogadorSnap, type UniformeResolvido, type VagaElenco } from "@b3d/core";
import { criarMaterialUniforme } from "./uniforme";
import { ElencoProcedural } from "./corpos";
import { FiguraModelo, type ModeloBase } from "./modelo";
import { FiguraBoneco, type BonecoPronto } from "./boneco";
import { aparenciaDoSlot } from "./boneco-dados";

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
  /** A cápsula e o nariz juntos, para esconder quando o corpo feito por código (G3) está em uso. */
  capsula: THREE.Group | null;
  /** O modelo 3D animado, se o `jogador.glb` carregou. */
  modelo: FiguraModelo | null;
  /** O boneco novo (rig-v1, H5), se carregou. Com ele a cápsula só aparece no modo leve. */
  boneco: FiguraBoneco | null;
  /** Número da camisa em cima do bot (G1: some quando um humano passa a controlar este jogador). Fora do grupo, para não girar. */
  numero: THREE.Sprite | null;
  /** Seta e anel "este é o jogador de um humano agora" (G1), na cor do time. Dentro do grupo. */
  seta: THREE.Mesh | null;
  anelDono: THREE.Mesh | null;
  /** O apelido que está aparecendo em cima do jogador agora (G1). */
  apelido: THREE.Sprite | null;
  /** Cor do time (hexadecimal) para o apelido. */
  cor: string;
}

/**
 * Os jogadores. O corpo é, nesta ordem de preferência: o boneco novo (rig-v1, H5, o padrão), o `jogador.glb` se alguém o pôs em
 * `modelos/` (F6, obsoleto desde a G3), o jogador feito por código (G3, a reserva se o boneco não carregar) ou a cápsula na cor do
 * time (modo leve e `?capsula=1`). Por cima, apelido, seta e anel
 * em quem um humano controla agora e um anel no chão sob quem está com a bola.
 */
export class Jogadores {
  readonly grupo = new THREE.Group();
  private readonly figuras = new Map<number, Figura>();
  private readonly anel: THREE.Mesh;
  /** Quem controla qual jogador agora (slot → apelido). Muda durante a partida (G1). */
  private donos = new Map<number, string>();
  /** Etiquetas de apelido já desenhadas (uma por apelido e cor), reaproveitadas a cada troca. */
  private readonly etiquetas = new Map<string, THREE.Sprite>();
  /** O jogador feito por código (G3), ou `null` se não foi pedido (`?capsula=1`) ou há um modelo GLB. */
  private readonly procedural: ElencoProcedural | null;
  private leve = false;
  /** Quem está mirando um passe agora e para quem (H1). */
  private miras: MiraDoPasse[] = [];
  /** Um anel no receptor e uma linha ligando quem passa a ele, para cada mira (no máximo 6 humanos mirando ao mesmo tempo). */
  private readonly marcadoresDeMira: Array<{ anel: THREE.Mesh; linha: THREE.Line; pontos: THREE.BufferAttribute }> = [];

  private readonly temBoneco: boolean;

  /** O boneco novo está em uso (carregou e não é o modo leve)? */
  private get usandoBoneco(): boolean {
    return this.temBoneco && !this.leve;
  }

  /** `procedural`: usar o jogador feito por código (G3) quando não há boneco. Falso com `?capsula=1`. */
  constructor(elenco: VagaElenco[], uniformes: [UniformeResolvido, UniformeResolvido], modelo: ModeloBase | null = null, procedural = true, boneco: BonecoPronto | null = null) {
    this.temBoneco = boneco !== null;
    const alturaTronco = JOGADOR.alturaCorpo - JOGADOR.raio * 2;

    for (const v of elenco) {
      // Goleiros usam uma cor fixa de contraste (SPEC 9.3); o resto, a cor do time
      const cor = v.goleiro ? (v.time === 0 ? PARTIDA.corGoleiroCasa : PARTIDA.corGoleiroVisitante) : uniformes[v.time].cor1;
      const uniforme: UniformeResolvido = v.goleiro ? { padrao: "liso", cor1: cor, cor2: cor, calcao: "#111111", meiao: cor } : uniformes[v.time];
      const grupo = new THREE.Group();

      let corpo: THREE.Mesh | null = null;
      let capsula: THREE.Group | null = null;
      let figuraModelo: FiguraModelo | null = null;
      let figuraBoneco: FiguraBoneco | null = null;
      if (boneco) {
        figuraBoneco = new FiguraBoneco(boneco.base, boneco.materialDoKit(`${v.time}${v.goleiro ? "g" : "l"}`), boneco.cabeloDe(v.slot), aparenciaDoSlot(v.slot).tipoRosto, v.goleiro, v.slot);
        grupo.add(figuraBoneco.raiz);
      }
      if (modelo && !boneco) {
        figuraModelo = new FiguraModelo(modelo, uniforme);
        grupo.add(figuraModelo.raiz);
      } else {
        corpo = new THREE.Mesh(new THREE.CapsuleGeometry(JOGADOR.raio, alturaTronco, 4, 14), criarMaterialUniforme(uniforme));
        corpo.position.y = JOGADOR.alturaCorpo / 2;
        corpo.castShadow = true;
        capsula = new THREE.Group();
        capsula.add(corpo);

        // "Nariz": mostra para onde o corpo olha
        const nariz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        nariz.position.set(JOGADOR.raio, JOGADOR.alturaCorpo * 0.72, 0);
        capsula.add(nariz);
        grupo.add(capsula);
      }

      // Seta e anel na cor do time: aparecem no jogador que um humano controla AGORA (G1). Goleiro nunca tem humano.
      let seta: THREE.Mesh | null = null;
      let anelDono: THREE.Mesh | null = null;
      let numero: THREE.Sprite | null = null;
      if (!v.goleiro) {
        seta = new THREE.Mesh(this.geoSeta, this.materialDaCor(cor));
        seta.rotation.x = Math.PI; // ponta para baixo
        seta.position.y = JOGADOR.alturaCorpo + 0.55;
        seta.name = "seta";
        seta.visible = false;
        grupo.add(seta);
        anelDono = new THREE.Mesh(this.geoAnelDono, this.materialDaCor(cor));
        anelDono.rotation.x = -Math.PI / 2;
        anelDono.position.y = 0.05;
        anelDono.visible = false;
        grupo.add(anelDono);
        numero = etiquetaNumero(v.numero);
        this.grupo.add(numero);
      }

      this.grupo.add(grupo);
      this.figuras.set(v.slot, { grupo, corpo, capsula, modelo: figuraModelo, boneco: figuraBoneco, numero, seta, anelDono, apelido: null, cor });
    }
    this.definirDonos(donosDoElenco(elenco));

    this.procedural = !modelo && !boneco && procedural ? new ElencoProcedural(elenco, uniformes) : null;
    if (this.procedural) this.grupo.add(this.procedural.grupo);
    this.aplicarVisibilidade();

    this.anel = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.anel.rotation.x = -Math.PI / 2;
    this.anel.position.y = 0.04;
    this.anel.visible = false;
    this.grupo.add(this.anel);

    for (let i = 0; i < 6; i++) {
      const anelMira = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.05, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false }),
      );
      anelMira.rotation.x = -Math.PI / 2;
      anelMira.position.y = 0.08;
      anelMira.renderOrder = 8;
      anelMira.visible = false;
      const pontos = new THREE.BufferAttribute(new Float32Array(6), 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", pontos);
      const linha = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
      linha.frustumCulled = false;
      linha.renderOrder = 8;
      linha.visible = false;
      this.grupo.add(anelMira, linha);
      this.marcadoresDeMira.push({ anel: anelMira, linha, pontos });
    }
  }

  /**
   * A mira do passe mudou (mensagem `mira`, H1): mostra, só enquanto PASSE está apertado, um anel no companheiro que receberia a
   * bola e uma linha até ele. Branco para o passe rasteiro e amarelo para o lançamento por cima.
   */
  definirMiras(miras: MiraDoPasse[]): void {
    this.miras = miras.slice(0, this.marcadoresDeMira.length);
    for (let i = 0; i < this.marcadoresDeMira.length; i++) {
      const m = this.marcadoresDeMira[i]!;
      const mira = this.miras[i];
      m.anel.visible = mira !== undefined;
      m.linha.visible = mira !== undefined;
      if (mira) {
        const cor = mira.alto ? 0xffd54a : 0xffffff;
        (m.anel.material as THREE.MeshBasicMaterial).color.set(cor);
        (m.linha.material as THREE.LineBasicMaterial).color.set(cor);
      }
    }
  }

  /** Modo leve (SPEC 7.3): volta para as cápsulas; fora dele, o jogador feito por código. */
  definirLeve(leve: boolean): void {
    this.leve = leve;
    this.aplicarVisibilidade();
  }

  private get usandoProcedural(): boolean {
    return this.procedural !== null && !this.leve;
  }

  private aplicarVisibilidade(): void {
    const proc = this.usandoProcedural;
    const bon = this.usandoBoneco;
    if (this.procedural) this.procedural.grupo.visible = proc;
    for (const f of this.figuras.values()) {
      if (f.capsula) f.capsula.visible = !proc && !bon;
      if (f.boneco) f.boneco.raiz.visible = bon;
    }
  }

  private readonly geoSeta = new THREE.ConeGeometry(0.32, 0.6, 4);
  private readonly geoAnelDono = new THREE.RingGeometry(0.5, 0.66, 28);
  private readonly materiaisDaCor = new Map<string, THREE.MeshBasicMaterial>();

  private materialDaCor(cor: string): THREE.MeshBasicMaterial {
    let m = this.materiaisDaCor.get(cor);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(cor), side: THREE.DoubleSide, depthWrite: false });
      this.materiaisDaCor.set(cor, m);
    }
    return m;
  }

  /** O apelido em cima do jogador, desenhado uma vez por apelido e cor. */
  private etiquetaDe(nome: string, cor: string): THREE.Sprite {
    const chave = `${cor}|${nome}`;
    let e = this.etiquetas.get(chave);
    if (!e) {
      e = etiqueta(nome, cor);
      e.visible = false;
      this.grupo.add(e);
      this.etiquetas.set(chave, e);
    }
    return e;
  }

  /** Quem controla qual jogador mudou (mensagem `donos`, G1): move a seta, o anel e o apelido. */
  definirDonos(donos: DonoDeSlot[]): void {
    this.donos = new Map(donos.map((d) => [d.slot, d.nome]));
    for (const [slot, f] of this.figuras) {
      const nome = this.donos.get(slot);
      const tem = nome !== undefined;
      if (f.seta) f.seta.visible = tem;
      if (f.anelDono) f.anelDono.visible = tem;
      if (f.numero) f.numero.visible = !tem;
      if (f.apelido) f.apelido.visible = false;
      f.apelido = tem ? this.etiquetaDe(nome, f.cor) : null;
      if (f.apelido) f.apelido.visible = true;
    }
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
      c.scale.y = 1;
    }
  }

  private posicionarMiras(jogadores: Array<Omit<JogadorSnap, "dir"> & { dir: number }>): void {
    for (let i = 0; i < this.miras.length; i++) {
      const mira = this.miras[i]!;
      const m = this.marcadoresDeMira[i]!;
      const de = jogadores.find((j) => j.slot === mira.de);
      const para = jogadores.find((j) => j.slot === mira.para);
      if (!de || !para) {
        m.anel.visible = false;
        m.linha.visible = false;
        continue;
      }
      m.anel.position.set(para.x, 0.08, para.z);
      m.anel.scale.setScalar(1 + 0.08 * Math.sin(performance.now() / 120)); // pulsa de leve
      m.pontos.setXYZ(0, de.x, 0.15, de.z);
      m.pontos.setXYZ(1, para.x, 0.15, para.z);
      m.pontos.needsUpdate = true;
    }
  }

  /** Solta o que o modelo animado prendeu (mixers). A cena chama ao trocar de partida ou de elenco. */
  liberar(): void {
    for (const f of this.figuras.values()) {
      f.modelo?.liberar();
      f.boneco?.liberar();
    }
    this.procedural?.liberar();
    for (const m of this.marcadoresDeMira) {
      m.anel.geometry.dispose();
      (m.anel.material as THREE.Material).dispose();
      m.linha.geometry.dispose();
      (m.linha.material as THREE.Material).dispose();
    }
    for (const e of this.etiquetas.values()) {
      e.material.map?.dispose();
      e.material.dispose();
    }
    this.etiquetas.clear();
    this.geoSeta.dispose();
    this.geoAnelDono.dispose();
    for (const m of this.materiaisDaCor.values()) m.dispose();
    this.materiaisDaCor.clear();
  }

  /** `bola`: a posição da bola neste quadro (o boneco escolhe o pé do chute e a defesa alta por ela). */
  atualizar(jogadores: Array<Omit<JogadorSnap, "dir"> & { dir: number }>, dominante: number, dtS = 0, bola?: Pick<BolaSnap, "x" | "y" | "z">): void {
    this.anel.visible = false;
    this.posicionarMiras(jogadores);
    if (this.usandoProcedural) this.procedural!.atualizar(jogadores, dtS);
    for (const j of jogadores) {
      const f = this.figuras.get(j.slot);
      if (!f) continue;
      f.grupo.position.set(j.x, 0, j.z);
      f.grupo.rotation.y = -j.dir; // dirX = cos, dirZ = sin: girar +X para +Z é no sentido horário visto de cima
      if (this.usandoBoneco) f.boneco?.atualizar({ anim: j.anim, vel: j.vel, x: j.x, z: j.z, dir: j.dir }, dtS, bola);
      else if (!this.usandoProcedural) this.pose(f, j);
      f.modelo?.atualizar(j.anim, j.vel, dtS);

      if (f.apelido) f.apelido.position.set(j.x, JOGADOR.alturaCorpo + 1.35, j.z);
      f.numero?.position.set(j.x, JOGADOR.alturaCorpo + 0.75, j.z);

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
