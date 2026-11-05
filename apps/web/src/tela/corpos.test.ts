import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ANIM, type UniformeResolvido, type VagaElenco } from "@b3d/core";
import { ElencoProcedural, type AmostraDoJogador } from "./corpos";
import { CORPO } from "./pose";

const uniformes: [UniformeResolvido, UniformeResolvido] = [
  { padrao: "listras-verticais", cor1: "#C8102E", cor2: "#F2F2F2", calcao: "#F2F2F2", meiao: "#C8102E" },
  { padrao: "faixa-diagonal", cor1: "#1565C0", cor2: "#FFFFFF", calcao: "#102A5C", meiao: "#1565C0" },
];

/** 12 jogadores: 5 de linha e o goleiro de cada time. */
function elenco(): VagaElenco[] {
  const v: VagaElenco[] = [];
  for (const time of [0, 1] as const) {
    for (let i = 0; i < 6; i++) v.push({ slot: time * 6 + i, time, numero: i + 1, nome: `J${time}${i}`, humano: false, goleiro: i === 0 });
  }
  return v;
}

const amostra = (slot: number, x: number, z: number, extra: Partial<AmostraDoJogador> = {}): AmostraDoJogador => ({ slot, x, z, dir: 0, vel: 0, anim: ANIM.parado, arrancando: false, ...extra });

function todas(e: ElencoProcedural): THREE.InstancedMesh[] {
  const l: THREE.InstancedMesh[] = [];
  e.grupo.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) l.push(o);
  });
  return l;
}

const translacao = (m: THREE.InstancedMesh, i: number): THREE.Vector3 => {
  const mat = new THREE.Matrix4();
  m.getMatrixAt(i, mat);
  return new THREE.Vector3().setFromMatrixPosition(mat);
};

describe("jogador feito por código: custo", () => {
  it("os 12 jogadores custam poucos desenhos (peças instanciadas), bem abaixo do limite de 300 da SPEC 7.4", () => {
    const e = new ElencoProcedural(elenco(), uniformes);
    expect(e.desenhos).toBeLessThanOrEqual(12);
    expect(todas(e).length).toBe(e.desenhos);
    // Nenhum Mesh solto: tudo é InstancedMesh
    let soltos = 0;
    e.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) soltos++;
    });
    expect(soltos).toBe(0);
  });

  it("tem um tronco por kit (Casa, Visitante, goleiro da Casa e do Visitante), com as camisas do clube", () => {
    const e = new ElencoProcedural(elenco(), uniformes);
    const troncos = todas(e).filter((m) => m.count <= 5);
    expect(troncos.map((m) => m.count).sort()).toEqual([1, 1, 5, 5]);
    for (const m of troncos) expect((m.material as THREE.Material).userData["uniforme"]).toBeDefined();
  });
});

describe("jogador feito por código: desenho", () => {
  it("cada jogador aparece onde o jogo diz, com o quadril à altura certa, e nenhuma matriz fica com NaN", () => {
    const e = new ElencoProcedural(elenco(), uniformes);
    const amostras = Array.from({ length: 12 }, (_, i) => amostra(i, i * 3 - 16, (i % 3) * 4 - 4, { dir: i * 0.5 }));
    e.atualizar(amostras, 1 / 60);
    for (const m of todas(e)) {
      for (let i = 0; i < m.count; i++) {
        const p = translacao(m, i);
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      }
    }
    // Os troncos (um por jogador, nos quatro kits) estão todos nas posições pedidas, no quadril
    const troncos = todas(e).filter((m) => m.count <= 5);
    const achados: Array<[number, number]> = [];
    for (const m of troncos) for (let i = 0; i < m.count; i++) {
      const p = translacao(m, i);
      expect(p.y).toBeCloseTo(CORPO.quadrilY - 0.0, 1);
      achados.push([Math.round(p.x), Math.round(p.z)]);
    }
    for (const a of amostras) expect(achados).toContainEqual([Math.round(a.x), Math.round(a.z)]);
  });

  it("jogador no chão (queda) fica com o quadril baixo; em pé, alto", () => {
    const e = new ElencoProcedural(elenco(), uniformes);
    const emPe = [amostra(1, 0, 0)];
    const caido = [amostra(2, 5, 5, { anim: ANIM.queda })];
    for (let i = 0; i < 40; i++) e.atualizar([...emPe, ...caido], 1 / 60);
    const troncos = todas(e).filter((m) => m.count <= 5);
    const alturas: number[] = [];
    for (const m of troncos) for (let i = 0; i < m.count; i++) {
      const p = translacao(m, i);
      if (Math.abs(p.x) < 0.01 && Math.abs(p.z) < 0.01) alturas.push(p.y);
      if (Math.abs(p.x - 5) < 0.01 && Math.abs(p.z - 5) < 0.01) alturas.push(-p.y);
    }
    expect(alturas.some((y) => y > 0.8)).toBe(true); // em pé
    expect(alturas.some((y) => y < 0 && y > -0.4)).toBe(true); // caído, o quadril perto do chão
  });

  it("os pés não afundam no gramado em nenhuma pose em pé (base da chuteira a no máximo 4 cm abaixo do chão), nem flutuam parado", () => {
    const poses: Array<[string, number, number]> = [
      ["parado", ANIM.parado, 0],
      ["corrida", ANIM.corrida, 6],
      ["arrancada", ANIM.arrancada, 8.2],
      ["chute", ANIM.chute, 0],
      ["passe", ANIM.passe, 0],
      ["comemoração", ANIM.comemoracao, 0],
      ["goleiro parado", ANIM.goleiroParado, 0],
      ["cabeceio", ANIM.cabeceio, 0],
      ["goleiro com bola", ANIM.goleiroComBola, 0],
      ["cobrança", ANIM.cobranca, 0],
    ];
    for (const [nome, anim, vel] of poses) {
      const e = new ElencoProcedural([{ slot: 1, time: 0, numero: 7, nome: "a", humano: false, goleiro: false }], [uniformes[0], uniformes[1]]);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 180; i++) {
        e.atualizar([amostra(1, 0, 0, { vel, anim, arrancando: anim === ANIM.arrancada })], 1 / 60);
        const botas = todas(e).find((m) => (m.material as THREE.MeshStandardMaterial).color?.getHex() === 0x141414)!;
        for (let k = 0; k < 2; k++) {
          const mat = new THREE.Matrix4();
          botas.getMatrixAt(k, mat);
          for (const lz of [-0.065, 0.205]) {
            const y = new THREE.Vector3(0, -0.07, lz).applyMatrix4(mat).y; // a base da chuteira, em mundo
            min = Math.min(min, y);
            max = Math.max(max, y);
          }
        }
      }
      expect(min, nome).toBeGreaterThan(-0.04);
      if (anim === ANIM.parado) expect(max, nome).toBeLessThan(0.05); // parado, o pé está no chão, não no ar
    }
  });

  it("liberar solta geometrias e materiais sem erro", () => {
    const e = new ElencoProcedural(elenco(), uniformes);
    e.atualizar([amostra(1, 0, 0)], 1 / 60);
    expect(() => e.liberar()).not.toThrow();
  });
});
