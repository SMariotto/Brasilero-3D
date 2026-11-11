import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as clonarComEsqueleto } from "three/examples/jsm/utils/SkeletonUtils.js";
import { JOGADOR, criarRng, type BolaSnap, type UniformeResolvido, type VagaElenco } from "@b3d/core";
import { CLIPE, CROSSFADE_S, ControladorDeRosto, decidir, velocidadeDaCorrida, type Decisao } from "./animacoes-boneco";
import { aparenciaDoSlot, caminhosDoBoneco, chaveDoCabelo, kitDoJogador, offsetDoRosto, type KitDeSkin } from "./boneco-dados";
import { desenharSkinGerada } from "./skin-gerada";

// O boneco novo (rig-v1, H5): um `model-brasilero-3d-rig-1malha.glb` (o corpo numa malha só, mais o rosto) com esqueleto de 17 ossos e 9 animações, clonado por jogador
// (SkeletonUtils.clone, um AnimationMixer cada), com skin por time, rosto de atlas e cabelo em .glb à parte. Se o arquivo não
// carrega, o jogo segue com o jogador feito por código: nada depende do modelo.
//
// Pontos que quebram se forem esquecidos (do exemplo `main.js` do rig):
//  1. As texturas embutidas nos .glb podem falhar ("Couldn't load texture blob-request"): `semTexturas` tira as referências antes
//     do parse, e as imagens entram por data URL ou arquivo.
//  2. O material "Rosto" usa o segundo conjunto de UV: `texture.channel = 1`; o atlas leva mipmaps, senão o rosto vira pontinhos.
//  3. Skin: material "Skin" nas peças do corpo; trocar a skin é trocar `material.map` (Nearest, flipY = false, sRGB, 128x128).
//  4. Cabelo: um SkinnedMesh próprio, com os índices de osso remapeados pelo nome para o esqueleto do corpo.

const loader = new GLTFLoader();
const interpretar = (bytes: ArrayBuffer): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> =>
  new Promise((ok, erro) => loader.parse(bytes, "", ok, erro));

/** Os 4 primeiros bytes de todo GLB: "glTF". O servidor pode devolver a página inicial no lugar de um arquivo que não existe. */
export const ehGlb = (bytes: ArrayBuffer): boolean => bytes.byteLength >= 12 && new DataView(bytes).getUint32(0, true) === 0x46546c67;

function jsonDoGlb(bytes: ArrayBuffer): { json: Record<string, unknown>; tamanho: number } {
  const dv = new DataView(bytes);
  const tamanho = dv.getUint32(12, true);
  return { json: JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, tamanho))) as Record<string, unknown>, tamanho };
}

/** Tira as referências de textura do .glb (o GLTFLoader nem tenta abrir imagens embutidas). As imagens entram depois, à mão. */
export function semTexturas(bytes: ArrayBuffer): ArrayBuffer {
  const { json, tamanho } = jsonDoGlb(bytes);
  const tirar = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const obj = o as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (/Texture$/.test(k)) delete obj[k];
      else tirar(obj[k]);
    }
  };
  for (const m of (json["materials"] as unknown[] | undefined) ?? []) tirar(m);
  delete json["textures"];
  delete json["images"];
  delete json["samplers"];

  let texto = JSON.stringify(json);
  while (texto.length % 4) texto += " ";
  const novo = new TextEncoder().encode(texto);
  const resto = new Uint8Array(bytes, 20 + tamanho); // o pedaço BIN inteiro (cabeçalho + dados)
  const saida = new Uint8Array(12 + 8 + novo.length + resto.length);
  const dv = new DataView(saida.buffer);
  saida.set(new Uint8Array(bytes, 0, 12), 0);
  dv.setUint32(12, novo.length, true);
  saida.set(new Uint8Array(bytes, 16, 4), 16);
  saida.set(novo, 20);
  saida.set(resto, 20 + novo.length);
  dv.setUint32(8, saida.length, true);
  return saida.buffer;
}

/** A primeira imagem embutida de um .glb, em base64 (o cabelo traz a dele). */
export function imagemDoGlb(bytes: ArrayBuffer): { b64: string; mime: string } | null {
  const { json, tamanho } = jsonDoGlb(bytes);
  const imagens = json["images"] as Array<{ bufferView?: number; mimeType?: string }> | undefined;
  const views = json["bufferViews"] as Array<{ byteOffset?: number; byteLength: number }> | undefined;
  const im = imagens?.[0];
  if (!im || im.bufferView === undefined || !views) return null;
  const v = views[im.bufferView]!;
  const u8 = new Uint8Array(bytes, 20 + tamanho + 8 + (v.byteOffset ?? 0), v.byteLength);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x4000) bin += String.fromCharCode(...u8.subarray(i, i + 0x4000));
  return { b64: btoa(bin), mime: im.mimeType ?? "image/png" };
}

// --- texturas --------------------------------------------------------------------------------------------------------------

export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error(`imagem não abriu: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/** Textura de pixel art: sem suavizar de perto, com mipmaps de longe (o telão mostra o boneco pequeno). */
function texturaDeSkin(fonte: TexImageSource): THREE.Texture {
  const t = new THREE.Texture(fonte as HTMLImageElement);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** O atlas dos rostos: segundo conjunto de UV (`channel = 1`) e mipmaps (LinearMipmapLinear), senão o rosto vira pontinhos. */
function texturaDoAtlas(img: HTMLImageElement): THREE.Texture {
  const t = new THREE.Texture(img);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.channel = 1;
  t.needsUpdate = true;
  return t;
}

// --- o modelo lido ---------------------------------------------------------------------------------------------------------

export interface CabeloPronto {
  /** Geometria com os ossos já remapeados para o esqueleto do corpo. Dividida por todos os jogadores que usam este cabelo. */
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface BonecoBase {
  /** O corpo como saiu do .glb (nunca entra na cena: cada jogador leva um clone). */
  cena: THREE.Group;
  clipes: THREE.AnimationClip[];
  /** Nome do clipe → duração (s). */
  duracoes: Map<string, number>;
  /** Os nomes dos ossos do esqueleto do corpo, na ordem dos índices. */
  ossos: string[];
  /** Fator para o boneco (0,44 m) ficar com `JOGADOR.alturaCorpo`. */
  escala: number;
  materialSkin: THREE.Material | null;
  materialRosto: THREE.Material | null;
  /** O atlas dos rostos (`null` esconde o rosto: sem o atlas ele apareceria como uma máscara lisa). */
  atlas: THREE.Texture | null;
  /** A imagem da skin modelo, de onde nascem as skins geradas por código. */
  skinModelo: HTMLImageElement | null;
  caminhos: ReturnType<typeof caminhosDoBoneco>;
  /** Cabelos já pedidos (cada arquivo é baixado uma vez só). */
  cabelos: Map<string, Promise<CabeloPronto | null>>;
}

const ehMalhaDoRosto = (m: THREE.SkinnedMesh): boolean => m.name === "Rosto_Expressao" || (m.material as THREE.Material).name === "Rosto";
const malhasDe = (raiz: THREE.Object3D): THREE.SkinnedMesh[] => {
  const lista: THREE.SkinnedMesh[] = [];
  raiz.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) lista.push(o as THREE.SkinnedMesh);
  });
  return lista;
};

/** Lê os bytes do corpo (sem as imagens). Lança erro se não for um GLB com esqueleto. */
export async function lerCorpo(bytes: ArrayBuffer, base = "/"): Promise<BonecoBase> {
  const gltf = await interpretar(semTexturas(bytes));
  const cena = gltf.scene;
  cena.updateMatrixWorld(true);
  const malhas = malhasDe(cena);
  const corpo = malhas.find((m) => !ehMalhaDoRosto(m));
  if (!corpo) throw new Error("o GLB não tem uma malha de corpo com esqueleto");
  const rosto = malhas.find(ehMalhaDoRosto);

  // O boneco inteiro, na pose de repouso, define a altura (o cabelo vem à parte e não conta)
  const altura = Math.max(0.01, new THREE.Box3().setFromObject(cena).getSize(new THREE.Vector3()).y);

  return {
    cena,
    clipes: gltf.animations,
    duracoes: new Map(gltf.animations.map((c) => [c.name, c.duration])),
    ossos: corpo.skeleton.bones.map((b) => b.name),
    escala: JOGADOR.alturaCorpo / altura,
    materialSkin: (malhas.find((m) => (m.material as THREE.Material).name === "Skin")?.material as THREE.Material | undefined) ?? (corpo.material as THREE.Material),
    materialRosto: rosto ? (rosto.material as THREE.Material) : null,
    atlas: null,
    skinModelo: null,
    caminhos: caminhosDoBoneco(base),
    cabelos: new Map(),
  };
}

let promessaDoCorpo: Promise<BonecoBase | null> | null = null;
let baseCarregada: string | null = null;

/** Baixa e lê o boneco uma vez só. Devolve `null` (sem erro) se o arquivo não existe ou não abre: aí valem os jogadores feitos por código. */
export function obterBoneco(base = "/"): Promise<BonecoBase | null> {
  if (promessaDoCorpo && baseCarregada === base) return promessaDoCorpo;
  baseCarregada = base;
  promessaDoCorpo = (async () => {
    try {
      const caminhos = caminhosDoBoneco(base);
      const r = await fetch(caminhos.corpo);
      if (!r.ok) return null;
      const bytes = await r.arrayBuffer();
      if (!ehGlb(bytes)) return null;
      const corpo = await lerCorpo(bytes, base);
      const [atlas, skin] = await Promise.all([carregarImagem(caminhos.atlas).catch(() => null), carregarImagem(caminhos.skinModelo).catch(() => null)]);
      if (atlas) corpo.atlas = texturaDoAtlas(atlas);
      corpo.skinModelo = skin;
      return corpo;
    } catch (e) {
      console.warn("Não consegui abrir o boneco 3D; usando o jogador feito por código.", e);
      return null;
    }
  })();
  return promessaDoCorpo;
}

// --- cabelo ----------------------------------------------------------------------------------------------------------------

/** Lê o .glb de um cabelo e liga os ossos dele ao esqueleto do corpo pelo nome. A imagem (se houver) vai em `imagem`. */
export async function lerCabelo(bytes: ArrayBuffer, ossosDoCorpo: readonly string[]): Promise<{ geometria: THREE.BufferGeometry; material: THREE.Material; imagem: { b64: string; mime: string } | null }> {
  const imagem = imagemDoGlb(bytes);
  const gltf = await interpretar(semTexturas(bytes));
  const malha = malhasDe(gltf.scene)[0];
  if (!malha) throw new Error("o GLB do cabelo não tem malha com esqueleto");
  const mapa = malha.skeleton.bones.map((b) => ossosDoCorpo.indexOf(b.name));
  const faltando = malha.skeleton.bones.filter((_, i) => mapa[i] === -1).map((b) => b.name);
  if (faltando.length) throw new Error(`ossos do cabelo que o corpo não tem: ${faltando.join(", ")}`);
  const indices = malha.geometry.getAttribute("skinIndex");
  for (let i = 0; i < indices.count; i++) indices.setXYZW(i, mapa[indices.getX(i)]!, mapa[indices.getY(i)]!, mapa[indices.getZ(i)]!, mapa[indices.getW(i)]!);
  indices.needsUpdate = true;
  return { geometria: malha.geometry, material: malha.material as THREE.Material, imagem };
}

/** Pede um cabelo (o arquivo só é baixado na primeira vez). `null` se não deu: o jogador fica sem cabelo, e o jogo segue. */
export function pedirCabelo(base: BonecoBase, chave: string): Promise<CabeloPronto | null> {
  let p = base.cabelos.get(chave);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(base.caminhos.cabelo(chave));
        if (!r.ok) return null;
        const bytes = await r.arrayBuffer();
        if (!ehGlb(bytes)) return null;
        const { geometria, material, imagem } = await lerCabelo(bytes, base.ossos);
        if (imagem) {
          const img = await carregarImagem(`data:${imagem.mime};base64,${imagem.b64}`);
          const t = new THREE.Texture(img);
          t.flipY = false;
          t.colorSpace = THREE.SRGBColorSpace;
          t.magFilter = t.minFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.needsUpdate = true;
          (material as THREE.MeshStandardMaterial).map = t;
          material.needsUpdate = true;
        }
        return { geometria, material };
      } catch (e) {
        console.warn(`Cabelo ${chave} não abriu; o jogador fica sem cabelo.`, e);
        return null;
      }
    })();
    base.cabelos.set(chave, p);
  }
  return p;
}

// --- o que a partida precisa ---------------------------------------------------------------------------------------------

/** Tudo que os jogadores de UMA partida usam: uma skin (textura e material) por kit e o cabelo de cada vaga. */
export interface BonecoPronto {
  base: BonecoBase;
  /** O material da skin do kit (`<time><g|l>`), dividido por todos os jogadores dele: uma textura por time. */
  materialDoKit(chave: string): THREE.Material | null;
  cabeloDe(slot: number): CabeloPronto | null;
  liberar(): void;
}

/** A skin de um kit: o PNG do clube (se vale) ou a gerada por código a partir da skin modelo e do uniforme. */
async function texturaDoKit(base: BonecoBase, kit: KitDeSkin): Promise<THREE.Texture | null> {
  if (kit.png) {
    try {
      return texturaDeSkin(await carregarImagem(base.caminhos.skin(kit.png)));
    } catch (e) {
      console.warn(`Skin ${kit.png}.png não abriu; usando a skin gerada.`, e);
    }
  }
  if (!base.skinModelo) return null;
  return texturaDeSkin(desenharSkinGerada(base.skinModelo, kit.uniforme));
}

/** Prepara skins e cabelos (baixa o que falta) para o elenco. Chamar uma vez por partida, antes de criar os jogadores. */
export async function prepararBoneco(base: BonecoBase, elenco: readonly VagaElenco[], uniformes: readonly [UniformeResolvido, UniformeResolvido], timeIds: readonly [string, string]): Promise<BonecoPronto> {
  const kits = new Map<string, KitDeSkin>();
  for (const v of elenco) {
    const k = kitDoJogador(v, uniformes, timeIds);
    kits.set(k.chave, k);
  }
  const materiais = new Map<string, THREE.Material>();
  const cabelos = new Map<number, CabeloPronto | null>();

  await Promise.all([
    ...[...kits.values()].map(async (k) => {
      const textura = await texturaDoKit(base, k);
      if (!base.materialSkin) return;
      const m = base.materialSkin.clone();
      (m as THREE.MeshStandardMaterial).map = textura;
      m.needsUpdate = true;
      materiais.set(k.chave, m);
    }),
    ...elenco.map(async (v) => {
      const a = aparenciaDoSlot(v.slot);
      cabelos.set(v.slot, await pedirCabelo(base, chaveDoCabelo(a.corte, a.corCabelo)));
    }),
  ]);

  return {
    base,
    materialDoKit: (chave) => materiais.get(chave) ?? null,
    cabeloDe: (slot) => cabelos.get(slot) ?? null,
    liberar() {
      for (const m of materiais.values()) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      materiais.clear();
    },
  };
}

// --- um jogador ------------------------------------------------------------------------------------------------------------

export interface EntradaDoBoneco {
  anim: number;
  vel: number;
  x: number;
  z: number;
  /** Direção do corpo, radianos a partir de +X. */
  dir: number;
}

/** Dois esqueletos de peças diferentes são o mesmo (mesmos ossos, na mesma ordem, e as mesmas matrizes de repouso)? */
function mesmosOssos(a: THREE.Skeleton, b: THREE.Skeleton): boolean {
  return a === b || (a.bones.length === b.bones.length && a.bones.every((o, i) => o === b.bones[i] && a.boneInverses[i]!.equals(b.boneInverses[i]!)));
}

/** Uma cópia do boneco para um jogador: esqueleto, animação, rosto e cabelo próprios; a skin é a do time. */
export class FiguraBoneco {
  /** Em pé, de frente para +X, com `JOGADOR.alturaCorpo` de altura e os pés em y = 0. */
  readonly raiz = new THREE.Group();
  private readonly cena: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly acoes = new Map<string, THREE.AnimationAction>();
  private atual: { nome: string; acao: THREE.AnimationAction } | null = null;
  private estado = -1;
  private readonly rostoCtl: ControladorDeRosto;
  private rostoMapa: THREE.Texture | null = null;
  private rostoMaterial: THREE.Material | null = null;
  private rostoNaTela = "";
  private ultimaEntrada: EntradaDoBoneco | null = null;
  private readonly tipoRosto: number;
  /** O esqueleto que todas as peças do jogador dividem. */
  private esqueleto: THREE.Skeleton | null = null;

  constructor(
    private readonly base: BonecoBase,
    materialDaSkin: THREE.Material | null,
    cabelo: CabeloPronto | null,
    tipoRosto: number,
    private readonly goleiro: boolean,
    slot = 0,
  ) {
    this.cena = clonarComEsqueleto(base.cena);
    this.raiz.add(this.cena);
    this.raiz.scale.setScalar(base.escala);
    this.raiz.rotation.y = Math.PI / 2; // o boneco olha para +Z; o jogo, para +X
    this.mixer = new THREE.AnimationMixer(this.cena);
    this.mixer.addEventListener("finished", (e) => {
      if (this.atual && e.action === this.atual.acao) this.voltarAoRepouso();
    });
    this.rostoCtl = new ControladorDeRosto(criarRng(slot * 7919 + 13).proximo);
    this.tipoRosto = tipoRosto;

    // O SkeletonUtils.clone (e o GLTFLoader) dão um esqueleto a cada peça: corpo, rosto e cabelo seriam 3 texturas de ossos e 3
    // atualizações por quadro para cada jogador (com o corpo antigo, de 20 peças, eram 21). As peças do mesmo jogador têm os mesmos
    // ossos, então dividem um esqueleto só.
    const pecas = malhasDe(this.cena);
    this.esqueleto = pecas[0]?.skeleton ?? null;
    for (const m of pecas.slice(1)) if (this.esqueleto && mesmosOssos(this.esqueleto, m.skeleton)) m.bind(this.esqueleto, m.bindMatrix);

    let malhaDoCorpo: THREE.SkinnedMesh | null = null;
    for (const m of pecas) {
      m.frustumCulled = false; // o osso se mexe fora da caixa da pose parada
      if (ehMalhaDoRosto(m)) {
        m.castShadow = false;
        if (base.atlas) {
          const mat = (m.material as THREE.Material).clone();
          mat.depthWrite = false;
          const mapa = base.atlas.clone(); // divide a imagem (e a textura na placa de vídeo) com os outros jogadores
          (mat as THREE.MeshStandardMaterial).map = mapa;
          mat.needsUpdate = true;
          m.material = mat;
          m.renderOrder = 1;
          this.rostoMapa = mapa;
          this.rostoMaterial = mat;
          this.mostrarRosto(0, 0);
        } else {
          m.visible = false;
        }
        continue;
      }
      m.castShadow = true;
      if (materialDaSkin && (m.material as THREE.Material).name === "Skin") m.material = materialDaSkin;
      malhaDoCorpo ??= m;
    }

    if (cabelo && malhaDoCorpo?.parent) {
      const hm = new THREE.SkinnedMesh(cabelo.geometria, cabelo.material);
      hm.bindMode = malhaDoCorpo.bindMode;
      malhaDoCorpo.parent.add(hm);
      hm.bind(malhaDoCorpo.skeleton, malhaDoCorpo.bindMatrix);
      hm.frustumCulled = false;
      hm.castShadow = true;
    }
  }

  /** O nome do clipe que está tocando (para a vitrine e os testes). */
  get clipeAtual(): string | null {
    return this.atual?.nome ?? null;
  }

  private mostrarRosto(anim: number, quadro: number): void {
    const chave = `${anim}/${quadro}`;
    if (!this.rostoMapa || chave === this.rostoNaTela) return;
    this.rostoNaTela = chave;
    const [x, y] = offsetDoRosto(this.tipoRosto, anim, quadro);
    this.rostoMapa.offset.set(x, y);
  }

  private acao(nome: string): THREE.AnimationAction | null {
    let a = this.acoes.get(nome);
    if (!a) {
      const clipe = this.base.clipes.find((c) => c.name === nome);
      if (!clipe) return null;
      a = this.mixer.clipAction(clipe);
      this.acoes.set(nome, a);
    }
    return a;
  }

  private tocar(d: Decisao): void {
    const a = this.acao(d.clipe);
    if (!a) return;
    // O mesmo clipe de repetição que já toca (por exemplo, queda → parado, com `parado` já tocando) segue sem recomeçar
    if (this.atual?.acao === a && d.repete) {
      a.timeScale = d.velocidade;
      return;
    }
    a.reset();
    a.setLoop(d.repete ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.enabled = true;
    a.timeScale = d.velocidade;
    a.time = d.inicioS;
    if (this.atual && this.atual.acao !== a) a.crossFadeFrom(this.atual.acao, CROSSFADE_S, false);
    a.play();
    this.atual = { nome: d.clipe, acao: a };
  }

  /** O clipe de uma jogada só terminou (comemorar, por exemplo) com o estado ainda valendo: volta para o repouso. */
  private voltarAoRepouso(): void {
    const e = this.ultimaEntrada;
    if (!e) return;
    const d = decidir(0, this.contexto(e, undefined), this.base.duracoes);
    if (d) this.tocar(d);
  }

  private contexto(e: EntradaDoBoneco, bola: (Pick<BolaSnap, "x" | "y" | "z"> & Partial<Pick<BolaSnap, "vx" | "vz">>) | undefined): Parameters<typeof decidir>[1] {
    return { goleiro: this.goleiro, x: e.x, z: e.z, dir: e.dir, vel: e.vel, bola };
  }

  /** Escolhe o clipe pelo estado do snapshot, troca com crossfade e avança `dt` segundos. A bola decide o pé do chute, do passe e da recepção, e a defesa alta. */
  atualizar(e: EntradaDoBoneco, dt: number, bola?: Pick<BolaSnap, "x" | "y" | "z"> & Partial<Pick<BolaSnap, "vx" | "vz">>): void {
    this.ultimaEntrada = e;
    if (e.anim !== this.estado) {
      this.estado = e.anim;
      const d = decidir(e.anim, this.contexto(e, bola), this.base.duracoes);
      if (d) this.tocar(d);
    } else if (this.atual?.nome === CLIPE.correr) {
      this.atual.acao.timeScale = velocidadeDaCorrida(e.vel); // o passo acompanha a velocidade real
    }
    const q = this.rostoCtl.atualizar(dt, e.anim);
    this.mostrarRosto(q.anim, q.quadro);
    this.mixer.update(dt);
  }

  /** Solta o que é só deste jogador (o mixer, o esqueleto e o rosto); skin e cabelo são do time e da partida. */
  liberar(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.cena);
    this.esqueleto?.dispose(); // a textura dos ossos
    this.rostoMapa?.dispose();
    this.rostoMaterial?.dispose();
  }
}
