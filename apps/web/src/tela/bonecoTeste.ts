// Um "boneco" de caixas em formato GLB, montado à mão, só para testar o carregador do modelo sem precisar do Mixamo.
// Tem os materiais Camisa, Calcao, Meiao, Pele e Chuteira e cinco animações simples (Parado, Corrida, Chute, Queda, GoleiroParado).
// Fica de frente para +Z (o padrão do glTF), com 1,8 m e os pés no chão. Não vai para o jogo: é usado pelos testes e por
// `ferramentas/gerar-boneco-teste.mjs`, que grava um arquivo para ver no navegador (`tela.html?modelo=boneco-teste`).

interface Parte {
  material: number;
  nome: string;
  centro: [number, number, number];
  tamanho: [number, number, number];
}

export const MATERIAIS_DO_BONECO = ["Camisa", "Calcao", "Meiao", "Pele", "Chuteira"] as const;

const PARTES: Parte[] = [
  { material: 4, nome: "ChuteiraE", centro: [-0.1, 0.04, 0.05], tamanho: [0.14, 0.08, 0.28] },
  { material: 4, nome: "ChuteiraD", centro: [0.1, 0.04, 0.05], tamanho: [0.14, 0.08, 0.28] },
  { material: 2, nome: "MeiaoE", centro: [-0.1, 0.295, 0], tamanho: [0.13, 0.43, 0.13] },
  { material: 2, nome: "MeiaoD", centro: [0.1, 0.295, 0], tamanho: [0.13, 0.43, 0.13] },
  { material: 1, nome: "Calcao", centro: [0, 0.68, 0], tamanho: [0.4, 0.34, 0.24] },
  { material: 0, nome: "Tronco", centro: [0, 1.2, 0], tamanho: [0.42, 0.7, 0.24] },
  { material: 0, nome: "BracoE", centro: [-0.29, 1.3, 0], tamanho: [0.12, 0.5, 0.14] },
  { material: 0, nome: "BracoD", centro: [0.29, 1.3, 0], tamanho: [0.12, 0.5, 0.14] },
  { material: 3, nome: "Cabeca", centro: [0, 1.68, 0], tamanho: [0.22, 0.24, 0.22] },
];

const CORES: Array<[number, number, number]> = [
  [0.9, 0.9, 0.9], // Camisa
  [0.2, 0.2, 0.2], // Calcao
  [0.9, 0.9, 0.9], // Meiao
  [0.85, 0.62, 0.4], // Pele
  [0.07, 0.07, 0.07], // Chuteira
];

interface Animacao {
  nome: string;
  duracao: number;
  /** Rotação (quaternion) e posição do corpo todo em cada instante. */
  quadros: Array<{ t: number; pos: [number, number, number]; rot: [number, number, number, number] }>;
}

const senoCos = (graus: number, eixo: "x" | "z"): [number, number, number, number] => {
  const a = (graus * Math.PI) / 360;
  return eixo === "x" ? [Math.sin(a), 0, 0, Math.cos(a)] : [0, 0, Math.sin(a), Math.cos(a)];
};
const SEM_GIRO: [number, number, number, number] = [0, 0, 0, 1];

const ANIMACOES: Animacao[] = [
  { nome: "Parado", duracao: 2, quadros: [{ t: 0, pos: [0, 0, 0], rot: SEM_GIRO }, { t: 1, pos: [0, 0.02, 0], rot: SEM_GIRO }, { t: 2, pos: [0, 0, 0], rot: SEM_GIRO }] },
  {
    nome: "Corrida",
    duracao: 0.7,
    quadros: [
      { t: 0, pos: [0, 0, 0], rot: senoCos(12, "x") },
      { t: 0.35, pos: [0, 0.1, 0], rot: senoCos(12, "x") },
      { t: 0.7, pos: [0, 0, 0], rot: senoCos(12, "x") },
    ],
  },
  { nome: "Chute", duracao: 0.9, quadros: [{ t: 0, pos: [0, 0, 0], rot: SEM_GIRO }, { t: 0.45, pos: [0, 0, 0], rot: senoCos(-25, "x") }, { t: 0.9, pos: [0, 0, 0], rot: SEM_GIRO }] },
  { nome: "Queda", duracao: 0.8, quadros: [{ t: 0, pos: [0, 0, 0], rot: SEM_GIRO }, { t: 0.8, pos: [0, 0.25, 0], rot: senoCos(90, "z") }] },
  { nome: "GoleiroParado", duracao: 1.6, quadros: [{ t: 0, pos: [0, 0, 0], rot: SEM_GIRO }, { t: 0.8, pos: [0, -0.05, 0], rot: SEM_GIRO }, { t: 1.6, pos: [0, 0, 0], rot: SEM_GIRO }] },
];

function caixa(c: [number, number, number], s: [number, number, number]): { pos: number[]; nor: number[]; idx: number[] } {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  // Seis faces: normal e dois eixos que formam a face, com o giro certo (de fora para dentro)
  const faces: Array<{ n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }> = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  for (const f of faces) {
    const base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      for (let k = 0; k < 3; k++) pos.push(c[k]! + (f.n[k]! + f.u[k]! * a + f.v[k]! * b) * (s[k]! / 2));
      nor.push(...f.n);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos, nor, idx };
}

/** Monta o GLB e devolve os bytes. */
export function montarBonecoTeste(): ArrayBuffer {
  const blobs: Uint8Array[] = [];
  const views: Array<Record<string, number>> = [];
  const accessors: Array<Record<string, unknown>> = [];

  const guardar = (dados: Float32Array | Uint16Array, alvo?: number): number => {
    const bytes = new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength);
    const resto = bytes.length % 4;
    const cheio = new Uint8Array(bytes.length + (resto ? 4 - resto : 0));
    cheio.set(bytes);
    const inicio = blobs.reduce((n, b) => n + b.length, 0);
    blobs.push(cheio);
    views.push({ buffer: 0, byteOffset: inicio, byteLength: bytes.length, ...(alvo ? { target: alvo } : {}) });
    return views.length - 1;
  };
  const acessor = (view: number, tipo: string, componente: number, n: number, extra: Record<string, unknown> = {}): number => {
    accessors.push({ bufferView: view, componentType: componente, count: n, type: tipo, ...extra });
    return accessors.length - 1;
  };

  const meshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];
  for (const p of PARTES) {
    const g = caixa(p.centro, p.tamanho);
    const n = g.pos.length / 3;
    const aPos = acessor(guardar(new Float32Array(g.pos), 34962), "VEC3", 5126, n, {
      min: [0, 1, 2].map((k) => Math.min(...g.pos.filter((_, i) => i % 3 === k))),
      max: [0, 1, 2].map((k) => Math.max(...g.pos.filter((_, i) => i % 3 === k))),
    });
    const aNor = acessor(guardar(new Float32Array(g.nor), 34962), "VEC3", 5126, n);
    const aIdx = acessor(guardar(new Uint16Array(g.idx), 34963), "SCALAR", 5123, g.idx.length);
    meshes.push({ name: p.nome, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor }, indices: aIdx, material: p.material }] });
    nodes.push({ name: p.nome, mesh: meshes.length - 1 });
  }
  // Nó 9 = o corpo (pai das partes), que as animações mexem; é filho da cena
  nodes.push({ name: "Corpo", children: PARTES.map((_, i) => i) });
  const corpo = nodes.length - 1;

  const animations = ANIMACOES.map((a) => {
    const tempos = new Float32Array(a.quadros.map((q) => q.t));
    const aTempo = acessor(guardar(tempos), "SCALAR", 5126, tempos.length, { min: [tempos[0]], max: [tempos[tempos.length - 1]] });
    const aPos = acessor(guardar(new Float32Array(a.quadros.flatMap((q) => q.pos))), "VEC3", 5126, a.quadros.length);
    const aRot = acessor(guardar(new Float32Array(a.quadros.flatMap((q) => q.rot))), "VEC4", 5126, a.quadros.length);
    return {
      name: a.nome,
      samplers: [
        { input: aTempo, output: aPos, interpolation: "LINEAR" },
        { input: aTempo, output: aRot, interpolation: "LINEAR" },
      ],
      channels: [
        { sampler: 0, target: { node: corpo, path: "translation" } },
        { sampler: 1, target: { node: corpo, path: "rotation" } },
      ],
    };
  });

  const json = {
    asset: { version: "2.0", generator: "Brasilero 3D boneco de teste" },
    scene: 0,
    scenes: [{ nodes: [corpo] }],
    nodes,
    meshes,
    materials: MATERIAIS_DO_BONECO.map((nome, i) => ({ name: nome, pbrMetallicRoughness: { baseColorFactor: [...CORES[i]!, 1], metallicFactor: 0, roughnessFactor: 0.8 } })),
    animations,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: blobs.reduce((n, b) => n + b.length, 0) }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = new Uint8Array(jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4)).fill(0x20);
  jsonPad.set(jsonBytes);
  const binTotal = blobs.reduce((n, b) => n + b.length, 0);
  const total = 12 + 8 + jsonPad.length + 8 + binTotal;

  const saida = new ArrayBuffer(total);
  const dv = new DataView(saida);
  const u8 = new Uint8Array(saida);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPad.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  u8.set(jsonPad, 20);
  let o = 20 + jsonPad.length;
  dv.setUint32(o, binTotal, true);
  dv.setUint32(o + 4, 0x004e4942, true); // "BIN\0"
  o += 8;
  for (const b of blobs) {
    u8.set(b, o);
    o += b.length;
  }
  return saida;
}
