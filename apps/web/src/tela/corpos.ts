import * as THREE from "three";
import { PARTIDA, type JogadorSnap, type UniformeResolvido, type VagaElenco } from "@b3d/core";
import { AnimadorDePose, CORPO, type Pose } from "./pose";
import { criarMaterialUniforme } from "./uniforme";

// O jogador 3D feito por código (G3): corpo humanoide estilizado de baixo polígono, em peças com articulações (cabeça, tronco,
// calção, coxa, canela, chuteira, braço e antebraço), tudo desenhado com InstancedMesh: uma peça de cada tipo para os 12
// jogadores de uma vez, então são ~11 desenhos em vez de 12 × 11. A camisa leva o padrão do clube pelo mesmo shader da F5.
// Nenhum modelo, textura ou animação vem de fora: a forma é geometria básica do Three.js e os movimentos são contas (pose.ts).

const PELES = ["#f1c9a5", "#d9a066", "#b9805a", "#8d5a3b", "#5b3a29"];
const COR_CHUTEIRA = "#141414";
const COR_CALCAO_GOLEIRO = "#151515";

/** O corpo olha para +Z; o jogo usa o ângulo `dir` medido a partir de +X, então o corpo gira (π/2 - dir) em torno de Y. */
const GIRO_BASE = Math.PI / 2;

/** Quanto o corpo deita (rad) quando `pose.deitar` vale 1: de costas, a cabeça para trás. */
const DEITAR_MAX = 1.45;

/** Quadril, ombros e pescoço, relativos ao quadril do jogador (m). */
const QUADRIL_X = 0.1;
const QUADRIL_Y = -0.02;
const OMBRO_X = 0.2;
const OMBRO_Y = 0.5;
const PESCOCO_Y = 0.54;

export type AmostraDoJogador = Pick<JogadorSnap, "slot" | "x" | "z" | "vel" | "anim"> & { dir: number };

interface Kit {
  chave: string;
  uniforme: UniformeResolvido;
  /** Slots que vestem este kit, na ordem em que ocupam o InstancedMesh do tronco. */
  slots: number[];
  tronco: THREE.InstancedMesh;
}

function cilindro(rTopo: number, rBase: number, altura: number, descerAte: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTopo, rBase, altura, seg, 1);
  g.translate(0, descerAte, 0);
  return g;
}

/** As formas de cada peça, com a origem na articulação (a peça cresce para baixo, ou para cima no tronco e na cabeça). */
export function criarGeometrias(): Record<"tronco" | "cabeca" | "calcao" | "coxa" | "canela" | "chuteira" | "braco" | "antebraco", THREE.BufferGeometry> {
  const tronco = cilindro(0.16, 0.125, CORPO.tronco, CORPO.tronco / 2, 14);
  tronco.scale(1.15, 1, 0.75);
  const cabeca = new THREE.SphereGeometry(0.115, 14, 10);
  cabeca.translate(0, 0.14, 0);
  cabeca.scale(0.95, 1.08, 1);
  const calcao = cilindro(0.145, 0.175, 0.26, -0.09, 12);
  calcao.scale(1.15, 1, 0.82);
  const chuteira = new THREE.BoxGeometry(0.1, 0.07, 0.27);
  chuteira.translate(0, -0.035, 0.07);
  return {
    tronco,
    cabeca,
    calcao,
    coxa: cilindro(0.075, 0.062, CORPO.coxa, -CORPO.coxa / 2),
    canela: cilindro(0.06, 0.048, CORPO.canela, -CORPO.canela / 2),
    chuteira,
    braco: cilindro(0.052, 0.045, CORPO.braco, -CORPO.braco / 2),
    antebraco: cilindro(0.043, 0.037, CORPO.antebraco, -CORPO.antebraco / 2),
  };
}

function instanciado(g: THREE.BufferGeometry, material: THREE.Material, n: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(g, material, n);
  m.castShadow = true;
  m.frustumCulled = false; // as instâncias andam pelo campo todo: a caixa da geometria não vale
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

/**
 * Os 12 jogadores desenhados por código. `atualizar` recebe a amostra interpolada de cada jogador (posição, direção, velocidade e
 * animação do servidor) e escreve as matrizes das peças.
 */
export class ElencoProcedural {
  readonly grupo = new THREE.Group();
  private readonly animadores = new Map<number, AnimadorDePose>();
  private readonly indice = new Map<number, { kit: Kit; i: number; ordem: number }>();
  private readonly kits: Kit[] = [];
  private readonly geometrias = criarGeometrias();
  private readonly materiais: THREE.Material[] = [];
  private readonly malhas: THREE.InstancedMesh[] = [];

  private readonly cabeca: THREE.InstancedMesh;
  private readonly calcao: THREE.InstancedMesh;
  private readonly coxa: THREE.InstancedMesh;
  private readonly canela: THREE.InstancedMesh;
  private readonly chuteira: THREE.InstancedMesh;
  private readonly braco: THREE.InstancedMesh;
  private readonly antebraco: THREE.InstancedMesh;

  // Matrizes de trabalho (reaproveitadas a cada quadro para não gerar lixo)
  private readonly a = new THREE.Matrix4();
  private readonly b = new THREE.Matrix4();
  private readonly pelve = new THREE.Matrix4();
  private readonly quadril = new THREE.Matrix4();
  private readonly joelho = new THREE.Matrix4();
  private readonly ombro = new THREE.Matrix4();
  private readonly cotovelo = new THREE.Matrix4();
  private readonly cabecaM = new THREE.Matrix4();
  private readonly tornozelo = new THREE.Matrix4();

  constructor(elenco: VagaElenco[], uniformes: [UniformeResolvido, UniformeResolvido]) {
    const n = elenco.length;
    const material = (): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
      this.materiais.push(m);
      return m;
    };
    const g = this.geometrias;

    this.cabeca = instanciado(g.cabeca, material(), n);
    this.calcao = instanciado(g.calcao, material(), n);
    this.coxa = instanciado(g.coxa, material(), n * 2);
    this.canela = instanciado(g.canela, material(), n * 2);
    const botas = new THREE.MeshStandardMaterial({ color: COR_CHUTEIRA, roughness: 0.6 });
    this.materiais.push(botas);
    this.chuteira = instanciado(g.chuteira, botas, n * 2);
    this.braco = instanciado(g.braco, material(), n * 2);
    this.antebraco = instanciado(g.antebraco, material(), n * 2);

    // O tronco leva o uniforme: um InstancedMesh para cada kit (Casa, Visitante, goleiro da Casa, goleiro do Visitante)
    const porKit = new Map<string, VagaElenco[]>();
    for (const v of elenco) {
      const chave = `${v.time}${v.goleiro ? "g" : "l"}`;
      porKit.set(chave, [...(porKit.get(chave) ?? []), v]);
    }
    // A camisa fica entre 47% e 87% da "altura" do shader: o tronco (0 a 0,55 m) é mapeado para esse trecho
    const alturaShader = CORPO.tronco / 0.4;
    const baseShader = -0.47 * alturaShader;
    for (const [chave, vagas] of porKit) {
      const ex = vagas[0]!;
      const cor = ex.goleiro ? (ex.time === 0 ? PARTIDA.corGoleiroCasa : PARTIDA.corGoleiroVisitante) : uniformes[ex.time].cor1;
      const uniforme: UniformeResolvido = ex.goleiro
        ? { padrao: "liso", cor1: cor, cor2: cor, calcao: COR_CALCAO_GOLEIRO, meiao: cor }
        : uniformes[ex.time];
      const mat = criarMaterialUniforme(uniforme, { soCamisa: true, altura: alturaShader, base: baseShader });
      this.materiais.push(mat);
      const tronco = instanciado(g.tronco, mat, vagas.length);
      const kit: Kit = { chave, uniforme, slots: vagas.map((v) => v.slot), tronco };
      this.kits.push(kit);
      vagas.forEach((v, i) => this.indice.set(v.slot, { kit, i, ordem: elenco.indexOf(v) }));
    }

    // Cores por jogador (uma vez só): pele, calção, meia e manga
    const cor = new THREE.Color();
    elenco.forEach((v, ordem) => {
      const kit = this.indice.get(v.slot)!.kit;
      const u = kit.uniforme;
      const pele = PELES[v.slot % PELES.length]!;
      this.cabeca.setColorAt(ordem, cor.set(pele));
      this.calcao.setColorAt(ordem, cor.set(u.calcao));
      for (const lado of [0, 1]) {
        const k = ordem * 2 + lado;
        this.coxa.setColorAt(k, cor.set(pele));
        this.canela.setColorAt(k, cor.set(u.meiao));
        this.braco.setColorAt(k, cor.set(u.cor1)); // manga curta da cor da camisa
        this.antebraco.setColorAt(k, cor.set(pele));
      }
      this.animadores.set(v.slot, new AnimadorDePose());
    });

    this.malhas.push(this.cabeca, this.calcao, this.coxa, this.canela, this.chuteira, this.braco, this.antebraco, ...this.kits.map((k) => k.tronco));
    for (const m of this.malhas) this.grupo.add(m);
    this.posicionarForaDoCampo();
  }

  /** Quantos desenhos o conjunto custa (cada InstancedMesh é um). */
  get desenhos(): number {
    return this.malhas.length;
  }

  private posicionarForaDoCampo(): void {
    // Antes do primeiro quadro, as instâncias ficam na origem; o `atualizar` as coloca no lugar certo.
    this.a.identity();
    for (const m of this.malhas) for (let i = 0; i < m.count; i++) m.setMatrixAt(i, this.a);
  }

  /** Desenha os jogadores deste quadro. */
  atualizar(jogadores: readonly AmostraDoJogador[], dt: number): void {
    for (const j of jogadores) {
      const dono = this.indice.get(j.slot);
      const animador = this.animadores.get(j.slot);
      if (!dono || !animador) continue;
      const pose = animador.atualizar(j.anim, j.vel, dt, Math.cos(j.dir) >= 0 ? 1 : -1);
      this.escrever(j, dono.kit, dono.i, dono.ordem, pose);
    }
    for (const m of this.malhas) m.instanceMatrix.needsUpdate = true;
    for (const m of [this.cabeca, this.calcao, this.coxa, this.canela, this.braco, this.antebraco]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private escrever(j: AmostraDoJogador, kit: Kit, iKit: number, ordem: number, p: Pose): void {
    const { a, b, pelve, quadril, joelho, ombro, cotovelo, cabecaM, tornozelo } = this;

    // Pelve: no chão (x, z), virada para onde o jogador olha, no alto do quadril, com roll e inclinação do tronco
    pelve.makeTranslation(j.x, 0, j.z);
    pelve.multiply(a.makeRotationY(GIRO_BASE - j.dir));
    pelve.multiply(a.makeTranslation(p.lado, CORPO.quadrilY + p.altura, 0));
    pelve.multiply(a.makeRotationZ(p.roll));
    pelve.multiply(a.makeRotationX(p.pitch - p.deitar * DEITAR_MAX));

    kit.tronco.setMatrixAt(iKit, pelve);
    this.calcao.setMatrixAt(ordem, pelve);
    cabecaM.copy(pelve).multiply(a.makeTranslation(0, PESCOCO_Y, 0)).multiply(b.makeRotationX(p.cabeca));
    this.cabeca.setMatrixAt(ordem, cabecaM);

    for (const lado of [0, 1] as const) {
      const s = lado === 0 ? 1 : -1; // 1 = esquerda do jogador (+X), -1 = direita
      const k = ordem * 2 + lado;
      const quadrilAng = lado === 0 ? p.quadrilE : p.quadrilD;
      const joelhoAng = lado === 0 ? p.joelhoE : p.joelhoD;
      const ombroAng = lado === 0 ? p.ombroE : p.ombroD;
      const abreAng = lado === 0 ? p.abreE : p.abreD;
      const cotoveloAng = lado === 0 ? p.cotoveloE : p.cotoveloD;

      // Perna: quadril -> coxa; joelho -> canela; tornozelo -> chuteira
      quadril.copy(pelve).multiply(a.makeTranslation(s * QUADRIL_X, QUADRIL_Y, 0)).multiply(b.makeRotationX(-quadrilAng));
      this.coxa.setMatrixAt(k, quadril);
      joelho.copy(quadril).multiply(a.makeTranslation(0, -CORPO.coxa, 0)).multiply(b.makeRotationX(joelhoAng));
      this.canela.setMatrixAt(k, joelho);
      tornozelo.copy(joelho).multiply(a.makeTranslation(0, -CORPO.canela, 0));
      this.chuteira.setMatrixAt(k, tornozelo);

      // Braço: ombro -> braço; cotovelo -> antebraço
      ombro.copy(pelve).multiply(a.makeTranslation(s * OMBRO_X, OMBRO_Y, 0)).multiply(b.makeRotationZ(s * abreAng)).multiply(a.makeRotationX(-ombroAng));
      this.braco.setMatrixAt(k, ombro);
      cotovelo.copy(ombro).multiply(a.makeTranslation(0, -CORPO.braco, 0)).multiply(b.makeRotationX(-cotoveloAng));
      this.antebraco.setMatrixAt(k, cotovelo);
    }
  }

  liberar(): void {
    for (const g of Object.values(this.geometrias)) g.dispose();
    for (const m of this.materiais) m.dispose();
    for (const m of this.malhas) m.dispose();
  }
}
