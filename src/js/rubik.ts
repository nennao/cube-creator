import { mat3, mat4, vec2, vec3 } from "gl-matrix";

import { initSolver, solve } from "./asyncSolver";
import { Camera } from "./camera";
import { Geometry } from "./geometry";
import { faceDefaults, Preset, presetDefault, PRESETS } from "./presets";
import {
  addBevel,
  addFaceBevel,
  cubeData,
  extrudedRingData,
  roundedCubeData,
  splitCubeFaceData,
  squareData,
} from "./shapes";
import * as utils from "./utils";
import {
  acosC,
  clamp,
  deg,
  hexToNRgb,
  max,
  min,
  mR,
  nRgbToHex,
  rad,
  randExp,
  randInt,
  ShallowNormalsInfo,
  TriVec3,
  V3,
  vec3ToV3,
} from "./utils";
import { Scene } from "./scene";

const EPSILON = 0.0000001;

type Side = 1 | -1;

enum FaceId {
  L = "L",
  R = "R",
  D = "D",
  U = "U",
  B = "B",
  F = "F",
}
const FACES = [FaceId.R, FaceId.U, FaceId.F, FaceId.L, FaceId.D, FaceId.B] as const;

enum Axis {
  x = "x",
  y = "y",
  z = "z",
}

enum Level {
  m1 = -1,
  z0 = 0,
  p1 = 1,
}

enum Dir {
  ccw = 1,
  cw = -1,
}

function getAxisVector(axis: Axis, s = 1): V3 {
  return [axis == Axis.x ? s : 0, axis == Axis.y ? s : 0, axis == Axis.z ? s : 0];
}

function getAxisAndSide(v: vec3): [Axis, Side] {
  const v2 = vec3ToV3(v).map((val, i) => [val, i]);
  const [val, idx] = max(v2, (k) => Math.abs(k[0]));
  return [[Axis.x, Axis.y, Axis.z][idx], val > 0 ? 1 : -1];
}

function getFaceId(axis: Axis, side: Side): FaceId {
  return {
    x: { "-1": FaceId.L, "1": FaceId.R },
    y: { "-1": FaceId.D, "1": FaceId.U },
    z: { "-1": FaceId.B, "1": FaceId.F },
  }[axis][side];
}

function orientFace(vertices: V3[], axis: Axis, side: Side): V3[] {
  if (axis == Axis.z && side == 1) {
    return vertices;
  }
  const rotateFn: (a: vec3, b: vec3, c: vec3, d: number) => vec3 = axis == Axis.y ? vec3.rotateX : vec3.rotateY;
  const angle = axis == Axis.z ? 180 : (axis == Axis.x && side == -1) || (axis == Axis.y && side == 1) ? -90 : 90;

  return vertices.map((v) => vec3ToV3(rotateFn(vec3.create(), v, [0, 0, 0], rad(angle))));
}

type ColorSet = { R: V3; U: V3; F: V3; L: V3; D: V3; B: V3 };

// prettier-ignore
const COLORS_CLASSIC: ColorSet = {
  [FaceId.L]: [0.70, 0.30, 0.00], [FaceId.R]: [0.60, 0.00, 0.10],
  [FaceId.D]: [0.90, 0.90, 0.15], [FaceId.U]: [0.85, 0.88, 0.90],
  [FaceId.B]: [0.00, 0.20, 0.55], [FaceId.F]: [0.00, 0.45, 0.22],
};
// prettier-ignore
const COLORS_BRIGHT: ColorSet = {
  [FaceId.L]: [0.90, 0.42, 0.10], [FaceId.R]: [0.81, 0.39, 0.58],
  [FaceId.D]: [0.95, 0.90, 0.20], [FaceId.U]: [0.85, 0.85, 0.85],
  [FaceId.B]: [0.24, 0.62, 0.81], [FaceId.F]: [0.45, 0.75, 0.15],
};

// prettier-ignore
const COLORS_NEUTRAL: ColorSet = {
  [FaceId.L]: [0.898, 0.459, 0.122], [FaceId.R]: [0.878, 0.141, 0.267],
  [FaceId.D]: [0.929, 0.929, 0.269], [FaceId.U]: [0.878, 0.878, 0.878],
  [FaceId.B]: [0.051, 0.435, 0.729], [FaceId.F]: [0.031, 0.667, 0.161],
};

// prettier-ignore
const COLORS_PASTEL: ColorSet = {
  [FaceId.L]: [0.961, 0.701, 0.456], [FaceId.R]: [0.923, 0.621, 0.601],
  [FaceId.D]: [0.960, 0.903, 0.549], [FaceId.U]: [0.973, 0.933, 0.902],
  [FaceId.B]: [0.552, 0.790, 0.885], [FaceId.F]: [0.592, 0.885, 0.750],
};

const COLOR_SCHEMES: { [key: string]: ColorSet } = {
  classic: COLORS_CLASSIC,
  bright: COLORS_BRIGHT,
  neutral: COLORS_NEUTRAL,
  pastel: COLORS_PASTEL,
};

function getFaceColors(faceId: FaceId, vertexCount: number, scheme: string): V3[] {
  const colorMap = COLOR_SCHEMES[scheme] || COLOR_SCHEMES.classic;
  const color = colorMap[faceId];
  return Array(vertexCount).fill(color);
}

const COLORS: { [key: string]: [number, number, number] } = {
  bl: [0.08, 0.08, 0.08],
  st: [0.42, 0.42, 0.42],
  si: [0.594, 0.588, 0.576],
  go: [0.6, 0.54, 0.36],
  rg: [0.6, 0.42, 0.36],
};

const COLORS_PROC: { [key: string]: number } = {
  colorful: 1,
};

const randomizer = (): Preset => {
  const r = (s = 1, t = 0, dp = 2) => mR(s * Math.random() + t, dp);
  const blockType = r() < 0.5 ? "stickered" : "stickerless";

  const [cols, colsProc, colSchemes] = [Object.keys(COLORS), Object.keys(COLORS_PROC), Object.keys(COLOR_SCHEMES)];
  const bOptions1 = [...cols, ...colsProc];
  const bOptions2 = [...colSchemes];
  const fOptions = [...colSchemes, ...colSchemes, ...colsProc, ...cols];

  const randCol = () => nRgbToHex(Math.random(), Math.random(), Math.random());
  const randCol6 = () => Array.from({ length: 6 }, () => nRgbToHex(Math.random(), Math.random(), Math.random()));

  const blockColor =
    blockType == "stickered"
      ? Math.random() < 1 / (1 + bOptions1.length)
        ? randCol()
        : bOptions1[randInt(bOptions1.length)]
      : Math.random() < 1 / (1 + bOptions2.length)
      ? randCol6()
      : bOptions2[randInt(bOptions2.length)];

  const faceColor =
    Math.random() < 1 / (2 + fOptions.length)
      ? randCol()
      : Math.random() < 2 / (2 + fOptions.length)
      ? randCol6()
      : fOptions[randInt(fOptions.length)];

  const blockR = mR(Math.random() * (blockType == "stickered" ? 0.85 : 1), 2);
  const addStickers =
    blockR < 0.85 ? [blockType == "stickered", blockType == "stickered", true, true, false][randInt(5)] : false;

  const faceOptions = addStickers
    ? {
        faceCover: mR(1 - randExp(2) * (1 - (0.25 + blockR * 0.25)), 2),
        faceR: r(),
        faceEdgeR: r(),
        faceRingW: r(0.95, 0.05),
        faceExtrude: mR(randExp(2) * 0.1, 3),
        faceColor,
        faceMetallic: [0, 0, 0.5, 1, 1][randInt(5)],
        faceRoughness: r(0.5),
      }
    : faceDefaults;

  return {
    spread: mR(1 + randExp(5) * 0.25, 3),
    blockR,
    bevelW: r() < 0.0 ? 0 : mR(randExp(4) * 0.5, 2),

    blockType,
    blockColor,
    blockMetallic: [0, 0, 0.5, 1, 1][randInt(5)],
    blockRoughness: r(0.5),

    addStickers,
    ...faceOptions,
  };
};

type ClickedInfo = {
  axis: Axis;
  side: Side;
  block: Block;
  p: vec3;
  normal: vec3;
  center: vec3;
};

type MoveInfo = {
  currAngle: number;
  level: Level;
  normal: vec3;
  center: vec3;
  blockDir: vec3;
  shallowNormals?: ShallowNormalsInfo;
};

type MovedInfo = {
  axis: Axis;
  level: Level;
  side: Side;
};

type RotQueueItem = {
  axis: Axis;
  level: Level;
  dir: Dir;
  elapsedA: number;
  elapsedT: number;
  turns: number;
  finalTurns: number;
  reverse?: boolean;
};

class FaceBounds {
  private readonly root: Rubik;
  private readonly _geometry: Geometry;

  get geometry() {
    return this._geometry;
  }

  constructor(geo: Geometry, root: Rubik) {
    this.root = root;
    this._geometry = geo;
  }

  draw() {
    this.geometry.draw(this.root.shader);
  }
}

class Face {
  private readonly gl: WebGL2RenderingContext;
  private readonly block: Block;
  private readonly root: Rubik;
  readonly axis: Axis;
  readonly side: Side;
  readonly faceId: FaceId;

  private readonly _geometry: Geometry;

  get geometry() {
    return this._geometry;
  }

  constructor(gl: WebGL2RenderingContext, block: Block, root: Rubik, axis: Axis, side: Side, faceId?: FaceId) {
    this.gl = gl;
    this.block = block;
    this.root = root;

    this.axis = axis;
    this.side = side;
    this.faceId = faceId || getFaceId(axis, side);

    const [v, i, c, n] = this.initGeo();

    this._geometry = new Geometry(gl, v, c, i, n);
    this.initPosition();
  }

  initGeo() {
    const { root, axis, side, faceId } = this;
    const { faceColor, faceColorCustom6 } = root.config;
    const [v, i, n, info] = this.root.faceGeoData;
    const vertices0 = orientFace(v, axis, side);
    const normals = orientFace(n, axis, side);

    const vertices = addFaceBevel(this.root.bevelW, this.block.origPosition, vertices0, info);

    // const colors3: V3[] = Array.from({ length: vertices.length }, () => [Math.random(), Math.random(), Math.random()]);
    // const colors4: V3[] = Array.from({ length: 1 + vertices.length / 3 }, () => {
    //   const col: V3 = [Math.random(), Math.random(), Math.random()];
    //   return [col, col, col];
    // }).flat();

    const colors =
      faceColor == "custom6"
        ? Array(vertices.length).fill(faceColorCustom6[faceId])
        : getFaceColors(faceId, vertices.length, this.root.config.faceColor);

    return [vertices, i, colors, normals];
  }

  updateGeo() {
    const [v, i, c, n] = this.initGeo();
    this.geometry.update(v, c, i, n);
  }

  private initPosition() {
    mat4.translate(this.geometry.transform, mat4.create(), this.block.displayPosition);
  }

  updatePosition() {
    this.geometry.transform = mat4.create();
    this.initPosition();
  }

  draw() {
    this.geometry.draw(this.root.shader);
  }
}

class Block {
  private readonly gl: WebGL2RenderingContext;
  private readonly root: Rubik;
  faces: Face[];
  position: vec3;
  readonly origPosition: V3;
  private _boundingBox: TriVec3[] = [];

  readonly faceRotation = mat3.create();
  private readonly _geometry: Geometry;

  get boundingBox(): TriVec3[] {
    return this._boundingBox.map((t) => utils.transformTriangle(t, this.root.transform));
  }

  get geometry() {
    return this._geometry;
  }

  constructor(gl: WebGL2RenderingContext, root: Rubik, position: V3) {
    this.gl = gl;

    this.root = root;
    this.position = position;
    this.origPosition = [...position];

    const [v, i, c] = this.initGeo();

    this._geometry = new Geometry(gl, v, c, i);
    this.faces = this.createFaces();
    this.initPosition();
  }

  initGeo() {
    const { blockType, blockColor2, blockColorCustom6 } = this.root.config;
    const stickerless = blockType == "stickerless";

    const pos = this.origPosition;

    let faces = pos.map((p, i) => (p < 0 ? i + 3 : i)).filter((_, i) => pos[i]);

    if (!faces.length) {
      faces = [0, 1, 2, 3, 4, 5];
    }

    const [v0, i] = stickerless ? splitCubeFaceData(...this.root.blockGeoData, faces) : this.root.blockGeoData;

    const v = addBevel(this.root.bevelW, this.root.blockR, pos, v0);

    const vCount = v.length;
    // const triCount = vCount / 3;

    // const colors2: V3[] = Array(vCount).fill([1, 1, 1]);
    // const colors3: V3[] = Array.from({ length: vCount }, () => [Math.random(), Math.random(), Math.random()]);
    // const colors4: V3[] = Array.from({ length: triCount + 1 }, () => {
    //   const col: V3 = [Math.random(), Math.random(), Math.random()];
    //   return [col, col, col];
    // }).flat();

    const colors0: () => V3[] = () => Array(vCount).fill([1, 1, 1]);
    const colors1: () => V3[] = () =>
      faces
        .map((f) => {
          const faceId = getFaceId([Axis.x, Axis.y, Axis.z][f % 3], f < 3 ? 1 : -1);
          const count = vCount / faces.length;
          return blockColor2 == "custom6"
            ? Array(count).fill(blockColorCustom6[faceId])
            : getFaceColors(faceId, count, blockColor2);
        })
        .flat();

    const colors = stickerless ? colors1() : colors0();

    return [v, i, colors];
  }

  updateGeo() {
    const [v, i, c] = this.initGeo();
    this.geometry.update(v, c, i);
  }

  get displayPosition(): V3 {
    const { spread } = this.root;
    return [this.position[0] * spread, this.position[1] * spread, this.position[2] * spread];
  }

  private createFaces(): Face[] {
    const position = this.position;
    const faces: Face[] = [];
    position.forEach((p, i) => {
      if (p) {
        faces.push(new Face(this.gl, this, this.root, [Axis.x, Axis.y, Axis.z][i], p > 0 ? 1 : -1));
      }
    });
    return faces;
  }

  private initPosition() {
    mat4.translate(this.geometry.transform, mat4.create(), this.displayPosition);

    const [v, i] = cubeData();

    const vertices = v.map((bVertex) => vec3ToV3(vec3.add(vec3.create(), bVertex, this.displayPosition)));
    this._boundingBox = utils.getTriangles(vertices, i);
  }

  updatePosition() {
    this.geometry.transform = mat4.create();
    this.faces.forEach((f) => {
      f.updatePosition();
    });
    this.initPosition();
  }

  private rotateUpdatePosition(rotateFn: (pos: vec3) => vec3, axis: Axis, dir: Dir, turns: number) {
    const rotatedPos = rotateFn(this.position);
    this.position = [mR(rotatedPos[0]), mR(rotatedPos[1]), mR(rotatedPos[2])];

    mat3.multiply(this.faceRotation, utils.mat3Rotation90(axis, dir * turns), this.faceRotation);
    this.updatePosition();
  }

  rotate(axis: Axis, dir: Dir, amt: number, isFinal: boolean, turns: number) {
    const axisV = getAxisVector(axis);

    if (isFinal) {
      const rotateFn = (pos: vec3) =>
        ({
          x: vec3.rotateX,
          y: vec3.rotateY,
          z: vec3.rotateZ,
        }[axis](vec3.create(), pos, [0, 0, 0], rad(90 * dir * turns)));
      this.rotateUpdatePosition(rotateFn, axis, dir, turns);
    } else {
      const angle = rad(amt * dir);
      const rotation = mat4.fromRotation(mat4.create(), angle, axisV);
      const _rotate = (entity: Block | Face) => {
        mat4.multiply(entity.geometry.transform, rotation, entity.geometry.transform);
      };
      _rotate(this);
      this.faces.forEach(_rotate);
    }
  }

  draw() {
    const { blockColor, blockColorCustom, blockMetallic, blockRoughness, addStickers } = this.root.config;
    const stickered = this.root.config.blockType == "stickered";
    this.root.shader.setUniform("u_BlockPosition", this.position);
    this.root.shader.setUniform("u_FaceRotation", this.faceRotation);

    const baseColor = [...(COLORS[blockColor] || blockColorCustom), 1];
    const procColor = COLORS_PROC[blockColor] || 0;

    this.root.shader.setUniform("u_BaseColorFactor", stickered ? baseColor : [1, 1, 1, 1]);
    this.root.shader.setUniform("u_NonVColor", stickered ? 1 : 0);
    this.root.shader.setUniform("u_ProcColor", stickered ? procColor : 0);

    this.root.shader.setUniform("u_MetallicFactor", blockMetallic);
    this.root.shader.setUniform("u_RoughnessFactor", blockRoughness);

    this.root.shader.setUniform("u_EnableBlockingAO", this.root.blockAO ? 1 : 0);

    this.geometry.draw(this.root.shader);
    addStickers && this.drawFaces();
  }

  drawFaces() {
    const { faceMetallic, faceRoughness, faceColor, faceColorCustom } = this.root.config;
    const useVColor = COLOR_SCHEMES.hasOwnProperty(faceColor) || faceColor == "custom6";

    const baseColor = [...(COLORS[faceColor] || faceColorCustom), 1];
    const procColor = COLORS_PROC[faceColor] || 0;

    this.root.shader.setUniform("u_BaseColorFactor", useVColor ? [1, 1, 1, 1] : baseColor);
    this.root.shader.setUniform("u_NonVColor", useVColor ? 0 : 1);
    this.root.shader.setUniform("u_ProcColor", useVColor ? 0 : procColor);
    this.root.shader.setUniform("u_EnableBlockingAO", 0);
    this.root.shader.setUniform("u_MetallicFactor", faceMetallic);
    this.root.shader.setUniform("u_RoughnessFactor", faceRoughness);

    for (let face of this.faces) {
      face.draw();
    }
  }
}

type Config = {
  blockType: "stickered" | "stickerless";
  blockColor: string;
  blockColorCustom: [number, number, number];
  blockColor2: string;
  blockMetallic: number;
  blockRoughness: number;
  blockColorCustom6: ColorSet;
  addStickers: boolean;
  faceColor: string;
  faceColorCustom: [number, number, number];
  faceColorCustom6: ColorSet;
  faceMetallic: number;
  faceRoughness: number;
};

type ConfigUpdate = {
  _spread?: number;
  blockR?: number;
  bevelW?: number;
  faceCover?: number;
  faceR?: number;
  faceEdgeR?: number;
  faceRingW?: number;
  faceExtrude?: number;

  blockType?: "stickered" | "stickerless";
  blockColor?: string;
  blockColorCustom?: [number, number, number];
  blockColor2?: string;
  blockColorCustom6?: ColorSet;
  blockMetallic?: number;
  blockRoughness?: number;

  addStickers?: boolean;
  faceColor?: string;
  faceColorCustom?: [number, number, number];
  faceColorCustom6?: ColorSet;
  faceMetallic?: number;
  faceRoughness?: number;
};

export class Rubik {
  private readonly gl: WebGL2RenderingContext;
  private readonly scene: Scene;
  private readonly camera: Camera;

  private readonly speed = 2; // turns/s
  private readonly solvingSpeed = 3; // turns/s
  private readonly scramblingSpeed = 4; // turns/s
  private rotationQueue: RotQueueItem[] = [];

  transform = mat4.create();
  invTransform = mat4.create();
  invTransform3 = mat3.create();

  private readonly animAlpha = 2.25;
  private blocks: Block[];

  private solving = false;
  private scrambling = false;
  private showBounding = false;

  _blockGeoData: [V3[], V3[], number[][]] = [[], [], []];
  _faceGeoData: [V3[], V3[], V3[], number[]] = [[], [], [], []];

  private boundingBox: [Axis, Side, TriVec3[]][] | undefined;
  private bounds: FaceBounds[] | undefined;

  manualBlockMoving = false;

  private moveBlockInfo: null | MoveInfo = null;
  private movedBlockInfo: null | MovedInfo = null;
  private clickedBlockInfo: null | ClickedInfo = null;

  blockRays = true;
  blockAO = true;

  _spread = 1;
  blockR = 0.15;
  bevelW = 0;
  faceCover = 0.85;
  faceR = 0.15;
  faceEdgeR = 0.5;
  faceRingW = 1;
  faceExtrude = 0.005;

  config: Config = {
    blockType: "stickered",
    blockColor: "bl",
    blockColorCustom: [0, 0, 0],
    blockColor2: "classic",
    blockColorCustom6: { ...COLORS_CLASSIC },
    blockMetallic: 0,
    blockRoughness: 0.25,

    addStickers: true,
    faceColor: "classic",
    faceColorCustom: [0, 0, 0],
    faceColorCustom6: { ...COLORS_CLASSIC },
    faceMetallic: 0,
    faceRoughness: 0.25,
  };

  private preset = "classic1";
  private userPresets: { [key: string]: Preset } = {};

  get spread() {
    return Math.max(this._spread, 1.001);
  }

  get faceCoverAdj() {
    const blockSide = 1 - this.blockR;
    return this.faceCover * blockSide;
  }

  get cubeR() {
    return 0.5 * (3 + 2 * (this.spread - 1));
  }

  get boundingPlanes(): [Axis, Side, TriVec3[]][] {
    return (this.boundingBox || []).map(([axis, side, triangles]) => [
      axis,
      side,
      triangles.map((t) => utils.transformTriangle(t, this.transform)),
    ]);
  }

  get rotating() {
    return this.rotationQueue.length > 0;
  }

  get shader() {
    return this.scene.activeShader;
  }

  constructor(gl: WebGL2RenderingContext, scene: Scene) {
    this.gl = gl;

    this.scene = scene;
    this.camera = scene.camera;

    this.updateBoundingBox();

    this.updateFaceGeo();
    this.updateBlockGeo();
    this.blocks = this.createBlocks();

    this.loadUserPresets();
    this.initDOMInputs();

    this.initialPosition();

    this.loadConfigFromPreset();

    initSolver();
  }

  private updateBlockGeo() {
    this._blockGeoData = roundedCubeData(1, this.blockR, this.bevelW);
  }

  private loadUserPresets() {
    const presets = JSON.parse(localStorage.getItem("userPresets") || "null");
    if (!presets) {
      localStorage.setItem("userPresets", "{}");
    } else {
      this.userPresets = presets;
    }
  }

  private loadConfigFromPreset(preset?: Preset) {
    preset = preset || PRESETS[this.preset] || this.userPresets[this.preset] || PRESETS.classic1;

    const update: ConfigUpdate = {
      _spread: preset.spread,
      blockR: preset.blockR,
      bevelW: preset.bevelW,
      faceCover: preset.faceCover,
      faceR: preset.faceR,
      faceEdgeR: preset.faceEdgeR,
      faceRingW: preset.faceRingW,
      faceExtrude: preset.faceExtrude,

      blockType: preset.blockType,
      blockMetallic: preset.blockMetallic,
      blockRoughness: preset.blockRoughness,

      addStickers: preset.addStickers,
      faceMetallic: preset.faceMetallic,
      faceRoughness: preset.faceRoughness,
    };

    const col = preset.blockColor;
    if (Array.isArray(col)) {
      update.blockColor2 = "custom6";
      const cols = [...col, ...Array(6).fill("#000000")].map(hexToNRgb);
      update.blockColorCustom6 = { R: cols[0], U: cols[1], F: cols[2], L: cols[3], D: cols[4], B: cols[5] };
    } else {
      if (COLORS.hasOwnProperty(col) || COLORS_PROC.hasOwnProperty(col)) {
        update.blockColor = col;
      } else if (COLOR_SCHEMES.hasOwnProperty(col)) {
        update.blockColor2 = col;
      } else {
        update.blockColor = "custom";
        update.blockColorCustom = hexToNRgb(col);
      }
    }

    const col2 = preset.faceColor;
    if (Array.isArray(col2)) {
      update.faceColor = "custom6";
      const cols = [...col2, ...Array(6).fill("#000000")].map(hexToNRgb);
      update.faceColorCustom6 = { R: cols[0], U: cols[1], F: cols[2], L: cols[3], D: cols[4], B: cols[5] };
    } else {
      if (COLORS.hasOwnProperty(col2) || COLORS_PROC.hasOwnProperty(col2) || COLOR_SCHEMES.hasOwnProperty(col2)) {
        update.faceColor = col2;
      } else {
        update.faceColor = "custom";
        update.faceColorCustom = hexToNRgb(col2);
      }
    }
    this.generalUIUpdate(update, false);
  }

  private saveConfigToPreset() {
    const { _spread, blockR, bevelW, faceCover, faceR, faceEdgeR, faceRingW, faceExtrude } = this;
    const { blockType, blockColor, blockColorCustom, blockColor2, blockColorCustom6, blockMetallic, blockRoughness } =
      this.config;
    const { addStickers, faceColor, faceColorCustom, faceColorCustom6, faceMetallic, faceRoughness } = this.config;

    const custom6ToStrArr = (c: ColorSet) => FACES.map((f) => c[f]).map((f) => nRgbToHex(...f));

    // prettier-ignore
    const res:Preset = {
      ...presetDefault,

      spread: _spread, blockR, bevelW, ...(addStickers ? { faceCover, faceR, faceEdgeR, faceRingW, faceExtrude } : {}), blockType,
      blockColor: blockType == "stickered" ? blockColor == "custom" ? nRgbToHex(...blockColorCustom) : blockColor
                                           : blockColor2 == "custom6" ? custom6ToStrArr(blockColorCustom6) : blockColor2,
      blockMetallic, blockRoughness,
      addStickers,
      ...(addStickers ? {
        faceColor: faceColor == "custom6" ? custom6ToStrArr(faceColorCustom6)
                 : faceColor == "custom" ? nRgbToHex(...faceColorCustom) : faceColor, faceMetallic, faceRoughness} : {}),
    };

    const nameInp = utils.getInputById("saveName");
    const name = `(u)${nameInp.value}`;

    this.userPresets[name] = res;
    localStorage.setItem("userPresets", JSON.stringify(this.userPresets));

    nameInp.value = "";
    this.preset = name;
    this.updatePresetSelectUI();
  }

  get blockGeoData(): [V3[], V3[], number[][]] {
    const [v, i, s] = this._blockGeoData;
    return [[...v], [...i], [...s]];
  }

  private updateFaceGeo() {
    const { faceCoverAdj, faceR, faceRingW, faceExtrude, faceEdgeR, bevelW } = this;
    this._faceGeoData = extrudedRingData(faceCoverAdj, 0.5, faceR, faceRingW, faceExtrude, faceEdgeR, bevelW);
  }

  get faceGeoData(): [V3[], V3[], V3[], number[]] {
    const [v, i, n, info] = this._faceGeoData;
    return [[...v], [...i], n.map((v) => v), [...info]];
  }

  private createBlocks() {
    const blocks = [];

    for (let x = -1; x < 2; x++) {
      for (let y = -1; y < 2; y++) {
        for (let z = -1; z < 2; z++) {
          // if (x + y + z == 3) continue;
          blocks.push(new Block(this.gl, this, [x, y, z]));
        }
      }
    }
    return blocks;
  }

  private updateBoundingBox() {
    const res = [];
    const bounds = [];
    const { cubeR } = this;

    for (let axis of [Axis.x, Axis.y, Axis.z]) {
      for (let side of [-1, 1] as const) {
        const faceId = getFaceId(axis, side);
        const [v, i] = squareData(cubeR * 2, cubeR);
        const vertices = orientFace(v, axis, side);
        const triangles = utils.getTriangles(vertices, i);
        const colors = getFaceColors(faceId, vertices.length, "classic");
        const x: [Axis, Side, TriVec3[]] = [axis, side, triangles];
        res.push(x);
        bounds.push(new FaceBounds(new Geometry(this.gl, vertices, colors, i), this));
      }
    }
    this.boundingBox = res;
    this.bounds = bounds;
  }

  updatePresetSelectUI() {
    utils.getElementById("presetsSelect").innerHTML = ["-", ...Object.keys(PRESETS), ...Object.keys(this.userPresets)]
      .map(
        (p) => `
        <option id="${p}_preset" value="${p}" ${p == this.preset ? "selected" : ""} ${
          p == "-" ? 'class="hidden"' : ""
        }>${p}</option>`
      )
      .join("");
    utils.getElementById("presetsSelect").onchange = utils.targetListener((t) => {
      this.preset = t.value;
      document.querySelectorAll("#presetsSelect option").forEach((n) => (n.innerHTML = n.id.split("_")[0]));
      utils.getElementById("-_preset").classList.add("hidden");
      this.loadConfigFromPreset();
    });
  }

  updateDOMVal(id: string, val: number | string) {
    utils.getElementById(id).innerText = val.toString();
  }

  private initDOMInputs() {
    const { blockType, blockColor, blockColor2, addStickers, faceColor } = this.config;

    const updater = (id: string) => utils.targetListener((t) => this.generalUIUpdate({ [id]: +t.value }));
    const updaterStr = (id: string) =>
      utils.targetListener((t) => this.generalUIUpdate({ [id]: t.value.split("_")[1] }));

    this.updatePresetSelectUI();

    for (let id of ["blockRays", "blockAO", "showBounding"] as const) {
      const handler = utils.targetListener((t) => {
        this[id] = t.checked;
        this.updateBlockGeo();
        this.updateGeo(true, false);
        this.triggerRedraw();
      });
      utils.handleInputById(id, this[id], "onclick", handler);
    }

    utils.handleButtonById("solve", "onclick", () => this.solve());
    utils.handleButtonById("scramble", "onclick", () => this.scramble());
    utils.handleButtonById("reset", "onclick", () => this.reset());

    utils.handleButtonById("sideMenuButton", "onclick", () =>
      utils.getElementById("sideMenu").classList.toggle("hidden")
    );

    utils.handleButtonById("randomizer", "onclick", () => {
      const option = utils.getElementById("-_preset") as HTMLOptionElement;
      option.selected = true;
      option.classList.remove("hidden");
      document.querySelectorAll("#presetsSelect option").forEach((n) => (n.innerHTML = n.id.split("_")[0]));
      this.loadConfigFromPreset(randomizer());
    });

    utils.handleButtonById("save", "onclick", () => this.saveConfigToPreset());

    utils.handleInputById("u_Debug", "0", "onchange", () => this.triggerRedraw());

    const envIntensity = this.scene.environment.intensity;
    const envIntensityHandler = utils.targetListener((t) => {
      this.scene.environment.intensity = +t.value;
      this.triggerRedraw();
      const envIntensity = this.scene.environment.intensity;
      this.updateDOMVal("envIntensityTxt", `${mR(10 ** envIntensity, 2)} (${mR(envIntensity, 2)})`);
    });
    utils.handleInputById("envIntensityRange", envIntensity.toString(), "onchange", envIntensityHandler);
    this.updateDOMVal("envIntensityTxt", `${mR(10 ** envIntensity, 2)} (${mR(envIntensity, 2)})`);

    const envColorHandler = utils.targetListener((t) => {
      this.scene.environment.color = t.value;
      this.triggerRedraw();
    });
    utils.handleInputById("envColorInput", this.scene.environment.color, "onchange", envColorHandler);

    // --------

    utils.handleInputById("spreadRange", this._spread.toString(), "onchange", updater("_spread"));

    for (let id of ["blockR", "bevelW", "faceCover", "faceR", "faceEdgeR", "faceRingW", "faceExtrude"] as const) {
      utils.handleInputById(`${id}Range`, this[id].toString(), "onchange", updater(id));
    }

    // --------

    utils.handleRadioByName("blockTypeRadio", `blockTypeRadio_${blockType}`, updaterStr("blockType"));

    utils.handleRadioByName("blockColorRadio", `blockColorRadio_${blockColor}`, updaterStr("blockColor"));

    for (let type of ["block", "face"]) {
      const color = type == "block" ? "blockColor" : "faceColor";
      const colorCustom = type == "block" ? "blockColorCustom" : "faceColorCustom";
      const colorCustom6 = type == "block" ? "blockColorCustom6" : "faceColorCustom6";

      const handler = utils.targetListener((t) => {
        this.generalUIUpdate({ [colorCustom]: utils.hexToNRgb(t.value), [color]: "custom" });
      });
      utils.handleInputById(`${type}ColorInput`, utils.nRgbToHex(...this.config[colorCustom]), "onchange", handler);

      utils.getElementById(`${type}ColorInputs6`).innerHTML = FACES.map(
        (f, i) =>
          `<label for="${type}ColorInput_${i}">${f}</label> <input type="color" id="${type}ColorInput_${i}" style="width: 45px"/>
           ${i == 2 ? "<br>" : ""}`
      ).join("");

      FACES.forEach((f, i) => {
        const handler = utils.targetListener((t) => {
          this.generalUIUpdate({ [colorCustom6]: { ...this.config[colorCustom6], [f]: utils.hexToNRgb(t.value) } });
        });
        const col = this.config[colorCustom6][f];
        utils.handleInputById(`${type}ColorInput_${i}`, utils.nRgbToHex(...col), "onchange", handler);
      });
    }

    utils.handleRadioByName("blockColorRadio2", `blockColorRadio_${blockColor2}`, updaterStr("blockColor2"));

    for (let id of ["blockMetallic", "blockRoughness", "faceMetallic", "faceRoughness"] as const) {
      utils.handleInputById(`${id}Range`, this.config[id].toString(), "onchange", updater(id));
    }

    const addStickersHandler = utils.targetListener((t) => this.generalUIUpdate({ addStickers: t.checked }));
    utils.handleInputById("addStickersCheck", addStickers, "onclick", addStickersHandler);

    utils.handleRadioByName("faceColorRadio", `faceColorRadio_${faceColor}`, updaterStr("faceColor"));
  }

  updateGeo(updateBlocks: boolean, updateFaces: boolean) {
    for (let block of this.blocks) {
      if (updateBlocks) {
        block.updateGeo();
      }
      if (updateFaces) {
        for (let face of block.faces) {
          face.updateGeo();
        }
      }
    }
  }

  generalUIUpdate(config: ConfigUpdate, edited = true) {
    let [updateBlockGeo, updateFaceGeo, updateGeoBlocks, updateGeoFaces] = [false, false, false, false];

    if (config._spread) {
      this._spread = config._spread;
      this.updateBoundingBox();
      for (let block of this.blocks) block.updatePosition();
      utils.getInputById("spreadRange").value = this._spread.toString();
      this.updateDOMVal("spreadTxt", this._spread);
    }

    for (let id of ["blockR", "bevelW", "faceCover", "faceR", "faceEdgeR", "faceRingW", "faceExtrude"] as const) {
      if (config[id] != undefined) {
        this[id] = config[id]!;
        if (id == "blockR" || id == "bevelW") {
          updateBlockGeo = true;
          updateGeoBlocks = true;
        }
        updateFaceGeo = true;
        updateGeoFaces = true;
        utils.getInputById(`${id}Range`).value = this[id].toString();
        this.updateDOMVal(`${id}Txt`, this[id]);
      }
    }

    if (config.blockType) {
      this.config.blockType = config.blockType;
      updateGeoBlocks = true;
      this.uiToggleBlockColorRadios();
      utils.getInputById(`blockTypeRadio_${this.config.blockType}`).checked = true;
    }

    for (let type of ["block", "face"]) {
      const color = type == "block" ? "blockColor" : "faceColor";
      const colorCustom = type == "block" ? "blockColorCustom" : "faceColorCustom";
      const colorCustom6 = type == "block" ? "blockColorCustom6" : "faceColorCustom6";

      if (config[colorCustom] != undefined) {
        this.config[colorCustom] = config[colorCustom]!;
        this.config[color] = "custom";
        utils.getInputById(`${type}ColorRadio_custom`).checked = true;
        utils.getInputById(`${type}ColorInput`).value = utils.nRgbToHex(...this.config[colorCustom]);
      }

      if (config[colorCustom6] != undefined) {
        this.config[colorCustom6] = config[colorCustom6]!;
        FACES.forEach((f, i) => {
          utils.getInputById(`${type}ColorInput_${i}`).value = utils.nRgbToHex(...this.config[colorCustom6][f]);
        });
        type == "face" && (updateGeoFaces = true);
        type == "block" && (updateGeoBlocks = true);
      }
    }

    if (config.blockColor != undefined) {
      this.config.blockColor = config.blockColor;
      utils.getInputById(`blockColorRadio_${this.config.blockColor}`).checked = true;
    }

    if (config.blockColor2 != undefined) {
      this.config.blockColor2 = config.blockColor2;
      updateGeoBlocks = true;
      utils.getInputById(`blockColorRadio_${this.config.blockColor2}`).checked = true;
      utils.getElementById("blockColorInputs6").classList[config.blockColor2 == "custom6" ? "remove" : "add"]("hidden");
    }

    for (let id of ["blockMetallic", "blockRoughness", "faceMetallic", "faceRoughness"] as const) {
      if (config[id] != undefined) {
        this.config[id] = config[id]!;
        this.updateDOMVal(`${id}Txt`, this.config[id]);
        utils.getInputById(`${id}Range`).value = this.config[id].toString();
      }
    }

    if (config.addStickers != undefined) {
      this.config.addStickers = config.addStickers;
      this.uiToggleStickerOptions();
      utils.getInputById("addStickersCheck").checked = this.config.addStickers;
    }

    if (config.faceColor != undefined) {
      this.config.faceColor = config.faceColor;
      const update = COLOR_SCHEMES.hasOwnProperty(this.config.faceColor) || this.config.faceColor == "custom6";
      update && (updateGeoFaces = true);
      utils.getInputById(`faceColorRadio_${this.config.faceColor}`).checked = true;
      utils.getElementById("faceColorInputs6").classList[config.faceColor == "custom6" ? "remove" : "add"]("hidden");
    }

    const preset = document.querySelector("#presetsSelect option:checked:not(#-_preset)");
    preset && edited && !preset.innerHTML.endsWith("(edited)") && (preset.innerHTML = preset.innerHTML + " (edited)");

    updateBlockGeo && this.updateBlockGeo();
    updateFaceGeo && this.updateFaceGeo();
    (updateGeoBlocks || updateGeoFaces) && this.updateGeo(updateGeoBlocks, updateGeoFaces);
    this.triggerRedraw();
  }

  uiToggleStickerOptions() {
    const show = this.config.addStickers;
    utils.getElementById("faceStickerOptions").classList[show ? "remove" : "add"]("hidden");
    utils.getElementById("faceStickerOptions2").classList[show ? "remove" : "add"]("hidden");
  }

  uiToggleBlockColorRadios() {
    const active = this.config.blockType;
    const inactive = active == "stickered" ? "stickerless" : "stickered";
    utils.getElementById(`blockColor_${active}`).classList.remove("hidden");
    utils.getElementById(`blockColor_${inactive}`).classList.add("hidden");
    this.config.addStickers = active == "stickered";
    utils.getInputById("addStickersCheck").checked = this.config.addStickers;
    this.uiToggleStickerOptions();
  }

  private triggerRedraw() {
    this.scene.triggerRedraw();
  }

  private queueRotation(axis: Axis, level: Level, dir: Dir, turns: number) {
    this.rotationQueue.push({ axis, level, dir, elapsedA: 0, elapsedT: 0, turns, finalTurns: turns });
  }

  private rotate(angle: number, rotAxis: vec3) {
    const rotation = mat4.fromRotation(mat4.create(), rad(angle), rotAxis);
    mat4.multiply(this.transform, rotation, this.transform);
    mat4.invert(this.invTransform, this.transform);
    this.triggerRedraw();
  }

  mouseRotate(dx: number, dy: number) {
    this.rotate(dy, [1, 0, 0]);
    this.rotate(dx, [0, 1, 0]);
  }

  private facesToFacelet() {
    const faceletArr: string[] = [];

    for (let block of this.blocks) {
      const [x, y, z] = block.position;
      for (let face of block.faces) {
        const worldAS = vec3.transformMat3(vec3.create(), getAxisVector(face.axis, face.side), block.faceRotation);
        const [axis, side] = getAxisAndSide(worldAS);
        const idMultiply = [Axis.y, Axis.x, Axis.z].indexOf(axis) + (side < 0 ? 3 : 0);
        const a = [x, -z, x, x, z, -x][idMultiply];
        const b = [z, -y, -y, -z, -y, -y][idMultiply];
        const id = idMultiply * 9 + (a + 1 + 3 * (b + 1));
        faceletArr[id] = face.faceId;
      }
    }
    return faceletArr.join("");
  }

  private solve() {
    if (this.rotating) return;
    this.solving = true;
    const facelet = this.facesToFacelet();

    solve(facelet).then((res) => {
      const axes = { x: Axis.x, y: Axis.y, z: Axis.z };
      res.forEach(([axis, level, dir, turns]) => this.queueRotation(axes[axis], level, dir, turns));
    });
  }

  private scramble() {
    this.scrambling = true;

    const levels = [Level.m1, Level.p1];
    const dirs = [Dir.ccw, Dir.cw];
    const randAxes = utils.shuffle([Axis.x, Axis.y, Axis.z]);

    for (let _ of Array(randInt(3) + 3)) {
      for (let axis of randAxes) {
        const level = levels[randInt(2)];
        const dir = dirs[randInt(2)];
        this.queueRotation(axis, level, dir, 1);
      }
    }
  }

  private initialPosition() {
    this.rotate(-45, [0, 1, 0]);
    this.rotate(25, [1, 0, 0]);
  }

  resetCam() {
    this.transform = mat4.create();
    this.invTransform = mat4.create();
    this.initialPosition();
    this.triggerRedraw();
  }

  private reset() {
    this.rotationQueue = [];
    this.scrambling = false;
    this.blocks = this.createBlocks();
    this.triggerRedraw();
  }

  update(dt: number) {
    this.runRotation(dt);
  }

  private runRotation(dt: number) {
    if (this.rotationQueue.length) {
      const { axis, level, dir, elapsedA, elapsedT, turns, finalTurns, reverse } = this.rotationQueue[0];
      const fullT = turns / (this.scrambling ? this.scramblingSpeed : this.solving ? this.solvingSpeed : this.speed);
      const t = elapsedT + dt;
      const maxA = turns * 90;
      const a = clamp(utils.easeInOut(t, fullT, maxA, this.animAlpha), 0, maxA) + (elapsedA > maxA ? maxA : 0);
      const targetA = Math.max(a, elapsedA);
      const amt = (reverse ? -1 : 1) * Math.max(0, targetA - elapsedA);
      const isFinal = t >= fullT;

      this.rotateSlice(axis, level, dir, amt, isFinal, finalTurns);

      if (isFinal) {
        this.rotationQueue.shift();
      } else {
        this.rotationQueue[0].elapsedA = targetA;
        this.rotationQueue[0].elapsedT = t;
      }

      if (!this.rotationQueue.length && this.scrambling) {
        this.scrambling = false;
      }
      if (!this.rotationQueue.length && this.solving) {
        this.solving = false;
      }
      this.triggerRedraw();
    }
  }

  private rotateSlice(axis: Axis, level: Level, dir: Dir, amt: number, isFinal: boolean, turns = 1) {
    const axisId = ["x", "y", "z"].indexOf(axis);
    for (let block of this.blocks) {
      if (block.position[axisId] == level) {
        block.rotate(axis, dir, amt, isFinal, turns);
      }
    }
  }

  private displayTransform(position: vec3) {
    return vec3.transformMat4(vec3.create(), position, this.transform);
  }

  private inverseDisplayTransform(position: vec3) {
    return vec3.transformMat4(vec3.create(), position, this.invTransform);
  }

  findClickedBlock(x: number, y: number): boolean {
    this.clickedBlockInfo = null;

    let closestDist = Infinity;
    let clickedAxis: null | Axis = null;
    let clickedSide: null | Side = null;
    let closestBlock: null | Block = null;
    let p: null | vec3 = null;

    const pNear = this.camera.position;
    const pFar = this.camera.getPickedVector(x, y);

    if (!utils.rayCubeSphere(pNear, pFar, [0, 0, 0], this.cubeR * 2)) {
      return false;
    }

    let cubeDist = Infinity;
    let clickedPlane: null | [Axis, Side, vec3] = null;

    for (let [axis, side, bBox] of this.boundingPlanes) {
      for (let triangle of bBox) {
        const intersection = utils.rayTriangle(pNear, pFar, triangle);
        if (!intersection) {
          continue;
        }
        const dist = vec3.distance(intersection, this.camera.position);
        if (dist < cubeDist) {
          cubeDist = dist;
          clickedPlane = [axis, side, intersection];
        }
      }
    }

    if (!clickedPlane) {
      return false;
    }

    const [axis, side, intersection] = clickedPlane;
    clickedAxis = axis;
    clickedSide = side;
    p = intersection;

    const axisId = ["x", "y", "z"].indexOf(axis);

    for (let block of this.blocks) {
      if (block.position[axisId] != side) {
        continue;
      }
      if (!utils.rayCubeSphere(pNear, pFar, this.displayTransform(block.displayPosition), 1)) {
        continue;
      }

      for (let triangle of block.boundingBox) {
        const intersection = utils.rayTriangle(pNear, pFar, triangle);
        if (!intersection) {
          continue;
        }
        const dist = vec3.distance(intersection, this.camera.position);
        if (dist < closestDist) {
          closestDist = dist;
          closestBlock = block;
        }
      }
    }

    if (closestBlock) {
      return this.handleClickedBlock([clickedAxis, clickedSide, closestBlock, p]);
    }
    return false;
  }

  private handleClickedBlock(clickedBlockInfo: [Axis, Side, Block, vec3]) {
    if (!this.rotating) {
      const [axis, side, block, p] = clickedBlockInfo;
      const normal = this.displayTransform(getAxisVector(axis, side));
      const center = vec3.scale(vec3.create(), normal, this.cubeR);
      this.clickedBlockInfo = { axis, side, block, p, normal, center };
    }
    return true;
  }

  handleMousemoveBlock(x: number, y: number, x0: number, y0: number) {
    if (this.manualBlockMoving) {
      this.handleManualBlockMove(x, y);
    } else if (vec2.distance([x0, y0], [x, y]) > 10) {
      this.handleManualSwipe(x, y);
    }
  }

  private handleManualSwipe(x: number, y: number) {
    if (!this.clickedBlockInfo) {
      return;
    }
    const { axis, normal, block, center, p } = this.clickedBlockInfo;

    const pNear = this.camera.position;
    const pFar = this.camera.getPickedVector(x, y);

    const intersection = utils.rayPlane(pNear, pFar, center, normal);
    if (!intersection) {
      console.warn("no ray plane (1) intersection");
      return;
    }

    const mouseV = vec3.subtract(vec3.create(), intersection, p);
    vec3.normalize(mouseV, this.inverseDisplayTransform(mouseV));

    const faceAxisIdx = ["x", "y", "z"].indexOf(axis);
    const rotAxisOptions = vec3ToV3(mouseV)
      .map((v, i) => [v, i])
      .filter((v, i) => i != faceAxisIdx);

    const minAxisIdx = min(rotAxisOptions, (k) => Math.abs(k[0]))[1];
    const minAxis = [Axis.x, Axis.y, Axis.z][minAxisIdx];
    const rotAxis = getAxisVector(minAxis);
    const level = block.position[minAxisIdx];

    let moveNormal = this.displayTransform(rotAxis);
    const moveCenter = this.displayTransform(getAxisVector(minAxis, level));

    const cameraDir = vec3.subtract(vec3.create(), this.camera.position, moveCenter);
    vec3.normalize(cameraDir, cameraDir);

    const { normal: adjustedNormal, shallowNormals } = utils.adjustMovePlaneCamAngle(moveNormal, cameraDir);
    moveNormal = adjustedNormal;

    const blockDirIntersection = shallowNormals
      ? utils.rayShallowPlane(pNear, pFar, moveCenter, shallowNormals)
      : utils.rayPlane(pNear, pFar, moveCenter, moveNormal);

    if (!blockDirIntersection) {
      console.warn("no ray plane (block dir) intersection");
      return;
    }

    const blockDir = vec3.subtract(vec3.create(), blockDirIntersection, moveCenter);
    if (vec3.length(blockDir) < EPSILON) {
      return;
    }
    vec3.normalize(blockDir, blockDir);

    if (shallowNormals) {
      shallowNormals.prev = blockDirIntersection;
      shallowNormals.prevDir = blockDir;
    }

    this.manualBlockMoving = true;
    this.moveBlockInfo = { currAngle: 0, level, normal: moveNormal, center: moveCenter, blockDir, shallowNormals };
  }

  private handleManualBlockMove(x: number, y: number) {
    if (!this.moveBlockInfo) {
      return;
    }

    const { level, normal, center, blockDir, shallowNormals } = this.moveBlockInfo;

    const pNear = this.camera.position;
    const pFar = this.camera.getPickedVector(x, y);

    const intersection = shallowNormals
      ? utils.rayShallowPlane(pNear, pFar, center, shallowNormals)
      : utils.rayPlane(pNear, pFar, center, normal);
    if (!intersection) {
      // todo binary search for an intersecting plane
      return;
    }

    const newDir = vec3.subtract(vec3.create(), intersection, center);
    if (vec3.length(newDir) < EPSILON) {
      return;
    }
    vec3.normalize(newDir, newDir);

    const [axis, side] = this.blockMoveAxisAndSide(blockDir, newDir);

    let diff: number;

    if (shallowNormals) {
      const { cameraDir, prev, prevDir } = shallowNormals;

      shallowNormals.prev = intersection;
      shallowNormals.prevDir = newDir;

      const movingDir = vec3.subtract(vec3.create(), intersection, prev);
      vec3.normalize(movingDir, movingDir);

      const dot = Math.abs(vec3.dot(cameraDir, movingDir));
      const angleSquish = 1 - dot;

      diff = angleSquish * deg(acosC(vec3.dot(prevDir, newDir)));

      const [axis2, side2] = this.blockMoveAxisAndSide(prevDir, newDir);
      this.rotateSlice(axis2, level, side2, diff, false);
    } else {
      const angle = deg(acosC(vec3.dot(blockDir, newDir)));
      diff = angle - this.moveBlockInfo.currAngle;
      this.rotateSlice(axis, level, side, diff, false);
    }

    this.moveBlockInfo.currAngle += diff;
    this.movedBlockInfo = { axis, level, side };
    this.triggerRedraw();
  }

  private blockMoveAxisAndSide(blockDir1: vec3, blockDir2: vec3) {
    const rotAxis = vec3.cross(vec3.create(), blockDir1, blockDir2);
    vec3.normalize(rotAxis, this.inverseDisplayTransform(rotAxis));
    return getAxisAndSide(rotAxis);
  }

  private getCurrentSliceMoveDetails() {
    let currAngle = this.moveBlockInfo ? this.moveBlockInfo.currAngle : 0;
    let axis: Axis, level: Level, dir: Dir;

    if (this.movedBlockInfo) {
      ({ axis, level, side: dir } = this.movedBlockInfo);
    } else if (this.rotationQueue.length) {
      ({ axis, level, dir } = this.rotationQueue[0]);
    } else {
      return { currAngle: 0, axis: Axis.x, level: Level.z0, dir: Dir.ccw };
    }

    const block = this.blocks.find((block) => block.position[["x", "y", "z"].indexOf(axis)] == level);

    if (block) {
      const center = getAxisVector(axis, level * this.spread);
      const transformedP = vec3.transformMat4(vec3.create(), [0, 0, 0], block.geometry.transform);

      const blockDir = vec3.sub(vec3.create(), block.displayPosition, center);
      const transformedDir = vec3.sub(vec3.create(), transformedP, center);

      vec3.normalize(blockDir, blockDir);
      vec3.normalize(transformedDir, transformedDir);

      const dot = vec3.dot(blockDir, transformedDir);
      const cross = vec3.cross(vec3.create(), blockDir, transformedDir);
      vec3.normalize(cross, cross);

      Math.abs(dot) < 0.99999 && ([axis, dir] = getAxisAndSide(cross));
      currAngle = deg(acosC(dot));
    }

    return { currAngle, axis, level, dir };
  }

  cleanupMousemoveBlock() {
    if (this.movedBlockInfo) {
      const { currAngle, axis, level, dir } = this.getCurrentSliceMoveDetails();

      const remA = currAngle - (currAngle > 90 ? 90 : 0);
      const reverse = remA < 45;
      const remElapsedA = reverse ? 90 - remA : remA;

      const elapsedT = utils.easeInOut(remElapsedA, 90, 1 / this.speed, 1 / this.animAlpha);
      const elapsedA = remElapsedA + (currAngle > 90 ? 90 : 0);
      const finalTurns = mR(currAngle / 90);

      this.rotationQueue.push({ axis, level, dir, elapsedA, elapsedT, turns: 1, finalTurns, reverse });

      this.triggerRedraw();
    }
    this.manualBlockMoving = false;
    this.moveBlockInfo = null;
    this.movedBlockInfo = null;
  }

  private drawBlocks() {
    for (let block of this.blocks) {
      block.draw();
    }
  }

  private drawBounds() {
    for (let bound of this.bounds || []) {
      bound.draw();
    }
  }

  private setUniforms() {
    const { currAngle, axis, level, dir } = this.getCurrentSliceMoveDetails();
    this.shader.setUniform("u_BlockR", this.blockR);
    this.shader.setUniform("u_BevelW", this.bevelW);
    this.shader.setUniform("u_Spread", this.spread);
    this.shader.setUniform("u_CurrAngle", rad(currAngle) * dir);
    this.shader.setUniform("u_Axis", ["x", "y", "z"].indexOf(axis));
    this.shader.setUniform("u_Level", level);
    this.shader.setUniform("u_RubikMatrix", this.transform);
    this.shader.setUniform("u_RubikMatrixInv", mat3.fromMat4(this.invTransform3, this.invTransform));
    this.shader.setUniform("u_EnableBlocking", this.blockRays ? 1 : 0);
    this.shader.setUniform("u_Debug", +(utils.getElementById("u_Debug") as HTMLInputElement).value);
  }

  draw() {
    this.shader.bind(this.camera);
    this.scene.environment.applyEnvironmentMap(0);
    this.setUniforms();
    this.drawBlocks();
    if (this.showBounding) {
      this.drawBounds();
    }
  }
}
