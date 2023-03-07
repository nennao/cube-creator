import { mat3, mat4, vec3 } from "gl-matrix";

export function mR(x: number, dp: number = 0) {
  return Math.round((x + Number.EPSILON) * Math.pow(10, dp)) / Math.pow(10, dp);
}

export function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function deg(rad: number) {
  return (rad * 180) / Math.PI;
}

export function acosC(val: number) {
  return Math.acos(clamp(val, -1, 1));
}

export function randInt(x: number) {
  return Math.floor(Math.random() * x);
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function min<T>(a: T[], key: (k: T) => number) {
  return a.reduce((x, y) => (key(x) < key(y) ? x : y));
}

export function max<T>(a: T[], key: (k: T) => number) {
  return a.reduce((x, y) => (key(x) > key(y) ? x : y));
}

export function divmod(a: number, b: number): [number, number] {
  return [Math.floor(a / b), a % b];
}

export function shuffle<T>(array: T[], inPlace = false): T[] {
  if (!inPlace) {
    array = [...array];
  }
  let m = array.length;
  let i: number;
  let t;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}

export function sort<T>(array: T[], key?: (a: T, b: T) => number, inPlace = false): T[] {
  if (!inPlace) {
    array = [...array];
  }
  key ? array.sort(key) : array.sort();
  return array;
}

export function sortNum(array: number[], key = (a: number, b: number) => a - b, inPlace = false) {
  return sort(array, key, inPlace);
}

export function arrayUniqueVals<T>(arr: T[]) {
  return arr.filter((val, i, arr) => arr.indexOf(val) == i);
}

export function arrayIntersect<T>(arr1: T[], arr2: T[]) {
  return arrayUniqueVals(arr1.filter((val) => arr2.includes(val)));
}

export function arrayRange(len: number, start = 0) {
  return Array.from({ length: len }, (_, i) => i + start);
}

export function zip<T1, T2>(arr1: T1[], arr2: T2[]) {
  return arr1.map((a, i): [T1, T2] => [a, arr2[i]]);
}

export function getElementById(id: string) {
  const el = document.getElementById(id);
  if (!el) throw `element "${id}" not found`;
  return el;
}

export function getInputById(id: string) {
  const el = getElementById(id);
  if (el instanceof HTMLInputElement) {
    return el;
  }
  throw `input element "${id}" not found`;
}

export function targetListener(listener: (t: HTMLInputElement) => void) {
  return (e: Event) => {
    listener(e.target as HTMLInputElement);
  };
}

type InputEvents = "onclick" | "onchange";

export function handleInputById(id: string, val: string | boolean, type: InputEvents, listener: (e: Event) => void) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) {
    typeof val == "boolean" ? (el.checked = val) : (el.value = val);
    el[type] = listener;
  } else {
    console.warn(`cant find input with id ${id}`);
  }
}

export function handleButtonById(id: string, type: InputEvents, listener: (e: Event) => void) {
  const el = document.getElementById(id);
  if (el instanceof HTMLButtonElement || el instanceof HTMLDivElement) {
    el[type] = listener;
  } else {
    console.warn(`cant find button with id ${id}`);
  }
}

export function handleRadioByName(name: string, val: string | boolean, listener: (e: Event) => void) {
  document.querySelectorAll(`input[name=${name}]`).forEach((n) => {
    if (n instanceof HTMLInputElement) {
      if (n.value == val) {
        n.checked = true;
      }
      n.onclick = listener;
    }
  });
}

export function handleFpsDisplay(dt: number, play: boolean) {
  const fpsTxt = document.getElementById("fpsTxt");
  if (!fpsTxt) {
    return;
  }

  fpsTxt.innerText = mR(1 / dt, 2).toString();
  if (play) {
    fpsTxt.classList.remove("faded");
  } else {
    fpsTxt.classList.add("faded");
  }
}

export type V2 = [number, number];
export type V3 = [number, number, number];

export function vec3ToV3(v: vec3): V3 {
  return [v[0], v[1], v[2]];
}

export type TriVec3 = [vec3, vec3, vec3];

export function getTriangles(vertices: V3[], indices: V3[]): TriVec3[] {
  return Array.from(indices).map(([i0, i1, i2]) => [vertices[i0], vertices[i1], vertices[i2]]);
}

export function transformTriangle(triangle: TriVec3, transform: mat4): TriVec3 {
  const f = (t: vec3) => vec3.transformMat4(vec3.create(), t, transform);
  return [f(triangle[0]), f(triangle[1]), f(triangle[2])];
}

export function subdivideIndexRows(
  row1: number[],
  row2: number[],
  subdivisions: number,
  positions: V3[],
  splitEdges?: number[][]
): [V3[][], number[][], number[][][]] {
  const zipped = zip(row1, row2);

  const newPositions = [];
  const newSplitEdges: number[][][] = [];

  for (let i = 0; i < subdivisions; i++) {
    newPositions.push(
      zipped.map(([i1, i2]) =>
        vec3ToV3(vec3.lerp(vec3.create(), positions[i1], positions[i2], (i + 1) / (subdivisions + 1)))
      )
    );
    splitEdges && newSplitEdges.push(zipped.map(([i1, i2]) => arrayIntersect(splitEdges[i1], splitEdges[i2])));
  }

  const newIndices = Array.from(newPositions, (p, i) => arrayRange(p.length, positions.length + i * p.length));
  return [newPositions, newIndices, newSplitEdges];
}

export function indexRowsToTriangles(row1: number[], row2: number[], ring = false, rev = (_: number) => false): V3[] {
  if (ring) {
    row1 = [...row1, row1[0]];
    row2 = [...row2, row2[0]];
  }
  return Array.from({ length: row1.length - 1 }, (_, i): [V3, V3] =>
    rev(i)
      ? [
          [row1[i], row2[i], row2[i + 1]],
          [row1[i], row2[i + 1], row1[i + 1]],
        ]
      : [
          [row1[i], row2[i], row1[i + 1]],
          [row1[i + 1], row2[i], row2[i + 1]],
        ]
  ).flat();
}

export function indexRingToTriangles(row1: number[], row2: number[]): V3[] {
  return indexRowsToTriangles(row1, row2, true);
}

export function indexSectorToTriangles(sector: number[], circle = false): V3[] {
  const center = sector[0];
  if (circle) {
    sector = [...sector, sector[1]];
  }
  return Array.from({ length: sector.length - 2 }, (_, i) => [center, sector[i + 1], sector[i + 2]]);
}

export function indexCircleToTriangles(circle: number[]): V3[] {
  return indexSectorToTriangles(circle, true);
}

function raySphere(p1: vec3, p2: vec3, center: vec3, r: number) {
  // p1, p2 of the ray. center, r radius of sphere
  const p = vec3.subtract(vec3.create(), p1, center);
  const v = vec3.subtract(vec3.create(), p2, p1);

  const a = vec3.dot(v, v);
  const b = 2 * vec3.dot(p, v);
  const c = vec3.dot(p, p) - r * r;

  return b * b >= 4 * a * c;
}

export function rayCubeSphere(p1: vec3, p2: vec3, center: vec3, side: number) {
  // p1, p2 of the ray. center, side of cube
  return raySphere(p1, p2, center, 0.5 * side * Math.sqrt(3));
}

export function rayTriangle(p1: vec3, p2: vec3, triangle: TriVec3) {
  const EPSILON = 0.0000001;

  const [A, B, C] = triangle;

  const dir = vec3.subtract(vec3.create(), p2, p1);

  let e1, e2, h, s, q; // vec3s
  let a, f, u, v; // floats

  e1 = vec3.subtract(vec3.create(), B, A);
  e2 = vec3.subtract(vec3.create(), C, A);

  h = vec3.cross(vec3.create(), dir, e2);
  a = vec3.dot(e1, h);
  if (a > -EPSILON && a < EPSILON) {
    return null;
  }

  f = 1.0 / a;
  s = vec3.subtract(vec3.create(), p1, A);
  u = f * vec3.dot(s, h);
  if (u < 0.0 || u > 1.0) {
    return null;
  }

  q = vec3.cross(vec3.create(), s, e1);
  v = f * vec3.dot(dir, q);
  if (v < 0.0 || u + v > 1.0) {
    return null;
  }

  const t = f * vec3.dot(e2, q);
  if (t > EPSILON) {
    return vec3.add(vec3.create(), p1, vec3.scale(vec3.create(), dir, t));
  }
  return null;
}

export function rayPlaneT(p1: vec3, pDir: vec3, center: vec3, normal: vec3) {
  const EPSILON = 0.0000001;

  const denom = vec3.dot(pDir, normal);

  if (Math.abs(denom) > EPSILON) {
    return vec3.dot(vec3.subtract(vec3.create(), center, p1), normal) / denom;
  }
  return -1;
}

export function rayPlane(p1: vec3, p2: vec3, center: vec3, normal: vec3) {
  const EPSILON = 0.0000001;

  const pDir = vec3.subtract(vec3.create(), p2, p1);
  vec3.normalize(pDir, pDir);

  const t = rayPlaneT(p1, pDir, center, normal);
  if (t > EPSILON) {
    return vec3.add(vec3.create(), p1, vec3.scale(vec3.create(), pDir, t));
  }
  return null;
}

export type ShallowNormalsInfo = {
  normal: vec3;
  normal1: vec3;
  normal2: vec3;
  a1: number;
  a2: number;
  rotAxis: vec3;
  cameraDir: vec3;
  prev: vec3;
  prevDir: vec3;
};

export function rayShallowPlane(p1: vec3, p2: vec3, center: vec3, shallowNormals: ShallowNormalsInfo) {
  const EPSILON = 0.0000001;
  const { normal1, normal2, a1, a2, rotAxis } = shallowNormals;

  const pDir = vec3.subtract(vec3.create(), p2, p1);
  vec3.normalize(pDir, pDir);

  let t1 = rayPlaneT(p1, pDir, center, normal1);
  let t2 = rayPlaneT(p1, pDir, center, normal2);

  if (!(t1 > EPSILON || t2 > EPSILON)) {
    console.warn("no ray plane (shallow) intersection");
    return null;
  }

  t1 = t1 > EPSILON ? t1 : Infinity;
  t2 = t2 > EPSILON ? t2 : Infinity;

  const [t, n, angle] = t1 < t2 ? [t1, normal1, -1 * a1] : [t2, normal2, -1 * a2];

  const planeCamDirAdjust = vec3.cross(vec3.create(), n, [0, 0, 1]);
  vec3.cross(planeCamDirAdjust, planeCamDirAdjust, n);
  vec3.normalize(planeCamDirAdjust, planeCamDirAdjust);
  vec3.scale(planeCamDirAdjust, planeCamDirAdjust, 0.5);

  const intersection = vec3.add(vec3.create(), p1, vec3.scale(vec3.create(), pDir, t));
  vec3.add(intersection, intersection, planeCamDirAdjust);

  const intersectionDir = vec3.subtract(vec3.create(), intersection, center);

  const adjusted = vec3.transformMat4(
    vec3.create(),
    intersectionDir,
    mat4.fromRotation(mat4.create(), rad(angle), rotAxis)
  );
  vec3.add(adjusted, adjusted, center);
  return adjusted;
}

export function adjustMovePlaneCamAngle(
  normal: vec3,
  cameraDir: vec3
): { normal: vec3; shallowNormals?: ShallowNormalsInfo } {
  const angle = deg(acosC(vec3.dot(normal, cameraDir)));
  const isObtuse = angle > 90;
  const acute = isObtuse ? 180 - angle : angle;

  const rotAxis = vec3.cross(vec3.create(), cameraDir, normal);
  vec3.normalize(rotAxis, rotAxis);

  const getNormal = (a: number) =>
    vec3.transformMat4(vec3.create(), normal, mat4.fromRotation(mat4.create(), rad(a), rotAxis));

  if (acute >= 85) {
    const [a1, a2] = [30, -30];
    const [normal1, normal2] = [getNormal(a1), getNormal(a2)];
    const [prev, prevDir] = [vec3.create(), vec3.create()];
    return { normal, shallowNormals: { normal, normal1, a1, normal2, a2, rotAxis, cameraDir, prev, prevDir } };
  }

  if (acute <= 45) {
    return { normal };
  }

  const angleDiff = (isObtuse ? 1 : -1) * (acute - (11.25 + 0.75 * acute));
  return { normal: getNormal(angleDiff) };
}

export function easeInOut(x: number, xScale = 1, yScale = 1, alpha = 2) {
  x = x / xScale;
  const xa = x ** alpha;
  const x1a = (1 - x) ** alpha;
  return (yScale * xa) / (xa + x1a);
}

export function normalToColor(n: vec3) {
  return vec3ToV3(vec3.scale(vec3.create(), vec3.add(vec3.create(), n, [1, 1, 1]), 0.5));
}

export function triangleToNormalColor(triangle: TriVec3) {
  const e1 = vec3.sub(vec3.create(), triangle[1], triangle[0]);
  const e2 = vec3.sub(vec3.create(), triangle[2], triangle[0]);

  const normal = vec3.cross(vec3.create(), e1, e2);
  return normalToColor(normal);
}

export function convertToFacePositions(positions: V3[], indices: V3[]): [V3[], V3[]] {
  const facePositions = [];
  const faceIndices = [];

  for (let i = 0; i < indices.length; i++) {
    const newIndices: V3 = [i * 3, i * 3 + 1, i * 3 + 2];
    const triangle = indices[i];
    facePositions.push(...triangle.map((oldI) => positions[oldI]));
    faceIndices.push(newIndices);
  }
  return [facePositions, faceIndices];
}

export function mat3Rotation90(axis: "x" | "y" | "z", turns: number) {
  turns %= 4;
  let s = Math.round(Math.sin(rad(90 * turns)));
  let c = Math.round(Math.cos(rad(90 * turns)));

  // prettier-ignore
  const mat:mat3 = axis == "x" ?
    [ 1,  0,  0,
      0,  c,  s,
      0, -s,  c, ]
  : axis == "y" ?
    [ c,  0, -s,
      0,  1,  0,
      s,  0,  c, ]
  :
    [ c,  s,  0,
     -s,  c,  0,
      0,  0,  1, ]

  return mat;
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function nRgbToHex(r: number, g: number, b: number) {
  return rgbToHex(mR(r * 255), mR(g * 255), mR(b * 255));
}

function hexToRgb(hex: string, scale?: number): V3 {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    console.warn("couldnt parse hex string:", hex);
    return [0, 0, 0];
  }
  return [
    parseInt(result[1], 16) / (scale || 1),
    parseInt(result[2], 16) / (scale || 1),
    parseInt(result[3], 16) / (scale || 1),
  ];
}

export function hexToNRgb(hex: string): V3 {
  return hexToRgb(hex, 255);
}
