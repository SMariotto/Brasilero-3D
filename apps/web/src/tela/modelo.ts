import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as clonarComEsqueleto } from "three/examples/jsm/utils/SkeletonUtils.js";
import { JOGADOR, type UniformeResolvido } from "@b3d/core";
import { clipeDaAnimacao, duracaoDoCrossfade, repete, velocidadeDoClipe } from "./animacoes";
import { aplicarUniforme, criarMaterialUniforme } from "./uniforme";

// O jogador 3D animado (F6, ARQUITETURA 6.2). Um `jogador.glb` com esqueleto e as 14 animações, clonado por jogador, cada um com
// seu AnimationMixer. Se o arquivo não existe ou não carrega, o jogo segue com a cápsula: nada depende do modelo.

/** Onde o GLB fica no site, e como pedir outro para testar (`?modelo=nome` usa `modelos/nome.glb`). */
export function urlDoModelo(busca: string, base = "/"): string | null {
  const p = new URLSearchParams(busca);
  if (p.get("capsula") === "1") return null;
  const nome = (p.get("modelo") ?? "jogador").toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(nome)) return null;
  return `${base}modelos/${nome}.glb`;
}

/** O modelo já lido: a malha (em pé, de frente para +X, 1,80 m, pés em y=0), as animações e a altura original para o shader. */
export interface ModeloBase {
  raiz: THREE.Object3D;
  clipes: THREE.AnimationClip[];
  nomesDosClipes: Set<string>;
  /** Pé (`base`) e altura da malha no espaço local dela, na unidade original do arquivo (o shader pinta por essa posição). */
  base: number;
  altura: number;
  temCamisa: boolean;
}

const PAPEIS = ["camisa", "calcao", "meiao"] as const;
type Papel = (typeof PAPEIS)[number];

/** Que parte do uniforme um material do modelo é, pelo nome (o script do Blender renomeia para Camisa, Calcao, Meiao...). */
export function papelDoMaterial(nome: string): Papel | null {
  const n = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/^camisa|jersey|shirt|^top/.test(n)) return "camisa";
  if (/^calcao|shorts?|^bottom|pants/.test(n)) return "calcao";
  if (/^meiao|sock/.test(n)) return "meiao";
  return null;
}

/** Lê os bytes de um GLB e prepara o modelo. Lança erro se não for um GLB válido. */
export async function lerModelo(bytes: ArrayBuffer): Promise<ModeloBase> {
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((ok, erro) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.parse(bytes, "", ok, erro);
  });

  const raiz = new THREE.Group();
  raiz.add(gltf.scene);
  raiz.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(raiz);
  const altura = Math.max(0.01, caixa.max.y - caixa.min.y);

  // O shader do uniforme pinta pela posição da geometria (espaço local da malha), que pode estar em outra unidade (cm no Mixamo):
  // mede o pé e o topo ali, e não no espaço do mundo.
  let localMin = Infinity;
  let localMax = -Infinity;
  let temCamisa = false;
  raiz.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    localMin = Math.min(localMin, m.geometry.boundingBox!.min.y);
    localMax = Math.max(localMax, m.geometry.boundingBox!.max.y);
    m.castShadow = true;
    m.frustumCulled = false; // o osso se mexe fora da caixa da pose parada
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (papelDoMaterial(mat.name) === "camisa") temCamisa = true;
  });

  // Escala para JOGADOR.alturaCorpo, pés no chão e de frente para +X (o glTF olha para +Z)
  const escala = JOGADOR.alturaCorpo / altura;
  const ajuste = new THREE.Group();
  gltf.scene.position.y -= caixa.min.y;
  ajuste.add(raiz);
  ajuste.scale.setScalar(escala);
  ajuste.rotation.y = Math.PI / 2;

  return { raiz: ajuste, clipes: gltf.animations, nomesDosClipes: new Set(gltf.animations.map((a) => a.name)), base: localMin, altura: Math.max(0.01, localMax - localMin), temCamisa };
}

let promessa: Promise<ModeloBase | null> | null = null;
let urlCarregada: string | null = null;

/** Baixa e lê o modelo uma vez só. Devolve `null` (sem erro) se o arquivo não existe: aí valem as cápsulas. */
export function obterModelo(url: string | null): Promise<ModeloBase | null> {
  if (!url) return Promise.resolve(null);
  if (promessa && urlCarregada === url) return promessa;
  urlCarregada = url;
  promessa = (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const bytes = await r.arrayBuffer();
      // O servidor pode devolver a página inicial no lugar de um arquivo que não existe: confere a assinatura "glTF"
      if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) return null;
      return await lerModelo(bytes);
    } catch (e) {
      console.warn("Não consegui abrir o modelo 3D; usando as cápsulas.", e);
      return null;
    }
  })();
  return promessa;
}

/** Uma cópia do modelo, de um jogador, com animação e uniforme próprios. */
export class FiguraModelo {
  readonly raiz: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly acoes = new Map<string, THREE.AnimationAction>();
  private atual: { nome: string; acao: THREE.AnimationAction } | null = null;
  private readonly camisas: THREE.Material[] = [];
  private readonly calcoes: THREE.MeshStandardMaterial[] = [];
  private readonly meioes: THREE.MeshStandardMaterial[] = [];

  constructor(
    private readonly modelo: ModeloBase,
    uniforme: UniformeResolvido,
  ) {
    this.raiz = clonarComEsqueleto(modelo.raiz);
    this.mixer = new THREE.AnimationMixer(this.raiz);

    // Um material novo para cada pedaço de uniforme (as cores mudam por time); os outros ficam como o modelo veio
    const camisa = criarMaterialUniforme(uniforme, { altura: modelo.altura, base: modelo.base, soCamisa: true });
    this.raiz.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const trocar = (mat: THREE.Material): THREE.Material => {
        const papel = papelDoMaterial(mat.name);
        if (papel === "camisa") {
          this.camisas.push(camisa);
          return camisa;
        }
        if (papel === "calcao" || papel === "meiao") {
          const novo = new THREE.MeshStandardMaterial({ color: papel === "calcao" ? uniforme.calcao : uniforme.meiao, roughness: 0.8 });
          (papel === "calcao" ? this.calcoes : this.meioes).push(novo);
          return novo;
        }
        return mat;
      };
      m.material = Array.isArray(m.material) ? m.material.map(trocar) : trocar(m.material);
    });
  }

  /** Troca as cores sem recriar nada (humano que assume vaga de bot de outro time não acontece, mas o shader pede o mesmo caminho). */
  aplicar(uniforme: UniformeResolvido): void {
    for (const c of new Set(this.camisas)) aplicarUniforme(c, uniforme);
    for (const m of this.calcoes) m.color.set(uniforme.calcao);
    for (const m of this.meioes) m.color.set(uniforme.meiao);
  }

  private acao(nome: string): THREE.AnimationAction | null {
    let a = this.acoes.get(nome);
    if (!a) {
      const clipe = this.modelo.clipes.find((c) => c.name === nome);
      if (!clipe) return null;
      a = this.mixer.clipAction(clipe);
      this.acoes.set(nome, a);
    }
    return a;
  }

  /** Escolhe o clipe pelo estado do snapshot, troca com crossfade e avança `dt` segundos. */
  atualizar(anim: number, vel: number, dt: number): void {
    const nome = clipeDaAnimacao(anim, this.modelo.nomesDosClipes);
    if (nome) {
      const proxima = this.acao(nome);
      if (proxima && this.atual?.nome !== nome) {
        proxima.reset();
        proxima.setLoop(repete(nome) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        proxima.clampWhenFinished = true;
        proxima.enabled = true;
        const dur = duracaoDoCrossfade(this.atual?.nome ?? null, nome);
        if (this.atual) this.atual.acao.fadeOut(dur);
        proxima.fadeIn(dur).play();
        this.atual = { nome, acao: proxima };
      }
      if (this.atual) this.atual.acao.timeScale = velocidadeDoClipe(this.atual.nome, vel, this.atual.acao.getClip().duration);
    }
    this.mixer.update(dt);
  }

  liberar(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.raiz);
  }
}
