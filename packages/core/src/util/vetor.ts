// Matemática de vetor. Vec2 é o plano do chão (x, z); Vec3 inclui a altura (y). Funções puras, sem alocar além do resultado.

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const limitar = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const grausParaRad = (g: number): number => (g * Math.PI) / 180;

export const radParaGraus = (r: number): number => (r * 180) / Math.PI;

/** Leva um ângulo em radianos para o intervalo (-π, π]. */
export function normalizarAngulo(r: number): number {
  const volta = Math.PI * 2;
  let a = r % volta;
  if (a > Math.PI) a -= volta;
  else if (a <= -Math.PI) a += volta;
  return a;
}

export const vec2 = (x = 0, z = 0): Vec2 => ({ x, z });
export const soma2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const escala2 = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k });
export const ponto2 = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const comp2 = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Vetor de comprimento 1 na mesma direção; o vetor zero continua zero. */
export function norm2(a: Vec2): Vec2 {
  const c = comp2(a);
  return c > 1e-9 ? { x: a.x / c, z: a.z / c } : { x: 0, z: 0 };
}

/** Corta o comprimento do vetor em `max`. */
export function limitarComp2(a: Vec2, max: number): Vec2 {
  const c = comp2(a);
  return c > max && c > 0 ? { x: (a.x / c) * max, z: (a.z / c) * max } : { x: a.x, z: a.z };
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const soma3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const escala3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const comp3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
