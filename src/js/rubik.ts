import { mat3, mat4, vec2, vec3 } from "gl-matrix";

import { Camera } from "./camera";
import { Geometry } from "./geometry";
import { cubeData, extrudedRingData, roundedCubeData, splitCubeFaceData, squareData } from "./shapes";
import * as utils from "./utils";
import { acosC, clamp, deg, max, min, mR, rad, randInt, vec3ToV3, ShallowNormalsInfo, TriVec3, V3 } from "./utils";
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

// prettier-ignore
const COLORS_CLASSIC = {
    [FaceId.L]: [0.70, 0.30, 0.00], [FaceId.R]: [0.60, 0.00, 0.10],
    [FaceId.D]: [0.90, 0.90, 0.15], [FaceId.U]: [0.85, 0.88, 0.90],
    [FaceId.B]: [0.00, 0.20, 0.55], [FaceId.F]: [0.00, 0.45, 0.22],
  };
// prettier-ignore
const COLORS_BRIGHT = {
  [FaceId.L]: [0.90, 0.42, 0.10], [FaceId.R]: [0.81, 0.39, 0.58],
  [FaceId.D]: [0.95, 0.90, 0.20], [FaceId.U]: [0.85, 0.85, 0.85],
  [FaceId.B]: [0.24, 0.62, 0.81], [FaceId.F]: [0.45, 0.75, 0.15],
  };

const COLOR_SCHEMES = {
  classic: COLORS_CLASSIC,
  bright: COLORS_BRIGHT,
};

function getFaceColors(faceId: FaceId, vertexCount: number, scheme: string): V3[] {
  const colorMap = scheme == "bright" ? COLOR_SCHEMES.bright : COLOR_SCHEMES.classic;
  const color = colorMap[faceId];
  return Array(vertexCount).fill(color);
}

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
  reverse?: boolean;
};

const COLORS: { [key: string]: [number, number, number] } = {
  bl: [0.08, 0.08, 0.08],
  st: [0.42, 0.42, 0.42],
  si: [0.594, 0.588, 0.576],
  go: [0.6, 0.54, 0.36],
  rg: [0.6, 0.42, 0.36],
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

    const [v, i, c] = this.initGeo();

    this._geometry = new Geometry(gl, v, c, i);
    this.initPosition();
  }

  initGeo() {
    const { root, axis, side, faceId } = this;
    const [v, i] = extrudedRingData(root.faceCoverAdj, 0.5, root.faceR, root.faceRingW, root.faceExtrude);
    const vertices = orientFace(v, axis, side);
    const colors = getFaceColors(faceId, vertices.length, this.root.config.faceColor);
    return [vertices, i, colors];
  }

  updateGeo() {
    const [v, i, c] = this.initGeo();
    this.geometry.update(v, c, i);
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
  private readonly origPosition: vec3;
  private _boundingBox: TriVec3[] = [];

  private readonly faceRotation = mat3.create();
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
    const { blockType, blockColor2 } = this.root.config;
    const stickerless = blockType == "stickerless";

    let faces = vec3ToV3(this.origPosition)
      .map((p, i) => (p < 0 ? i + 3 : i))
      .filter((_, i) => this.origPosition[i]);

    if (!faces.length) {
      faces = [0, 1, 2, 3, 4, 5];
    }

    const [v, i] = stickerless ? splitCubeFaceData(...this.root.blockGeoData, faces) : this.root.blockGeoData;
    // const [v, i] = splitCubeFaceData(...this.root.blockGeoData, faces);

    const vCount = v.length;
    // const triCount = vCount / 3;

    // const colors2: V3[] = Array(vCount).fill([1, 1, 1]);
    // const colors3: V3[] = Array.from({ length: vCount }, () => [Math.random(), Math.random(), Math.random()]);
    // const colors4: V3[] = Array.from({ length: triCount }, () => {
    //   const col: V3 = [Math.random(), Math.random(), Math.random()];
    //   return [col, col, col];
    // }).flat();
    //

    const colors0: () => V3[] = () => Array(vCount).fill([1, 1, 1]);
    const colors1: () => V3[] = () =>
      faces
        .map((f) =>
          getFaceColors(getFaceId([Axis.x, Axis.y, Axis.z][f % 3], f < 3 ? 1 : -1), vCount / faces.length, blockColor2)
        )
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

    this.root.shader.setUniform("u_BaseColorFactor", stickered ? baseColor : [1, 1, 1, 1]);
    this.root.shader.setUniform("u_NonVColor", stickered ? 1 : 0);
    this.root.shader.setUniform("u_MetallicFactor", blockMetallic);
    this.root.shader.setUniform("u_RoughnessFactor", blockRoughness);

    this.root.shader.setUniform("u_EnableBlockingAO", this.root.blockAO ? 1 : 0);

    this.geometry.draw(this.root.shader);
    addStickers && this.drawFaces();
  }

  drawFaces() {
    const { faceMetallic, faceRoughness, faceColor, faceColorCustom } = this.root.config;
    const useVColor = COLOR_SCHEMES.hasOwnProperty(faceColor);

    const baseColor = [...(COLORS[faceColor] || faceColorCustom), 1];

    this.root.shader.setUniform("u_BaseColorFactor", useVColor ? [1, 1, 1, 1] : baseColor);
    this.root.shader.setUniform("u_NonVColor", useVColor ? 0 : 1);
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
  addStickers: boolean;
  faceColor: string;
  faceColorCustom: [number, number, number];
  faceMetallic: number;
  faceRoughness: number;
};

export class Rubik {
  private readonly gl: WebGL2RenderingContext;
  private readonly scene: Scene;
  private readonly camera: Camera;

  private readonly speed = 2; // turns/s
  private rotationQueue: RotQueueItem[] = [];

  transform = mat4.create();
  invTransform = mat4.create();
  invTransform3 = mat3.create();

  private readonly animAlpha = 2.25;
  private blocks: Block[];

  private scrambling = false;
  private showBounding = false;

  _blockGeoData: [V3[], V3[], number[][]] = [[], [], []];

  private boundingBox: [Axis, Side, TriVec3[]][] | undefined;
  private bounds: FaceBounds[] | undefined;

  manualBlockMoving = false;

  private moveBlockInfo: null | MoveInfo = null;
  private movedBlockInfo: null | MovedInfo = null;
  private clickedBlockInfo: null | ClickedInfo = null;

  blockRays = true;
  blockAO = true;

  _spread = 1.05;
  blockR = 0.15;
  faceCover = 0.75;
  faceR = 0.15;
  faceRingW = 1;
  faceExtrude = 0.005;

  config: Config = {
    blockType: "stickered",
    blockColor: "bl",
    blockColorCustom: [0, 0, 0],
    blockColor2: "bright",
    blockMetallic: 0,
    blockRoughness: 0.25,
    addStickers: true,
    faceColor: "classic",
    faceColorCustom: [0, 0, 0],
    faceMetallic: 0,
    faceRoughness: 0.25,
  };

  get spread() {
    return Math.max(this._spread, 1.001);
  }

  get faceCoverAdj() {
    const blockSide = 1 - this.blockR;
    return Math.min(this.faceCover, blockSide);
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

    this.updateBlockGeo();
    this.blocks = this.createBlocks();

    this.initDOMInputs();

    this.initialPosition();
  }

  private updateBlockGeo() {
    this._blockGeoData = roundedCubeData(1, this.blockR);
  }

  get blockGeoData(): [V3[], V3[], number[][]] {
    const [v, i, s] = this._blockGeoData;
    return [[...v], [...i], [...s]];
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

  private initDOMInputs() {
    const updateDOMVal = (id: string, val: number | string) => {
      utils.getElementById(id).innerText = val.toString();
    };

    for (let id of ["blockRays", "blockAO", "showBounding"] as const) {
      const handler = utils.targetListener((t) => {
        this[id] = t.checked;
        this.triggerRedraw();
      });
      utils.handleInputById(id, this[id], "onclick", handler);
    }

    utils.handleButtonById("scramble", "onclick", () => this.scramble());
    utils.handleButtonById("reset", "onclick", () => this.reset());

    utils.handleButtonById("sideMenuButton", "onclick", () =>
      utils.getElementById("sideMenu").classList.toggle("hidden")
    );

    const spreadHandler = utils.targetListener((t) => {
      this._spread = +t.value;
      this.updateBoundingBox();
      for (let block of this.blocks) block.updatePosition();
      this.triggerRedraw();
      updateDOMVal("spreadTxt", this._spread);
    });
    utils.handleInputById("spreadRange", this._spread.toString(), "onchange", spreadHandler);
    updateDOMVal("spreadTxt", this._spread);

    for (let id of ["blockR", "faceCover", "faceR", "faceRingW", "faceExtrude"] as const) {
      const handler = utils.targetListener((t) => {
        const prevCover = this.faceCoverAdj;
        this[id] = +t.value;
        this.updateGeo(id == "blockR", id == "blockR", id != "blockR" || this.faceCoverAdj != prevCover);
        this.triggerRedraw();
        updateDOMVal(`${id}Txt`, this[id]);
      });

      utils.handleInputById(`${id}Range`, this[id].toString(), "onchange", handler);
      updateDOMVal(`${id}Txt`, this[id]);
    }

    utils.handleInputById("u_Debug", "0", "onchange", () => this.triggerRedraw());

    const envIntensity = this.scene.environment.intensity;
    const envIntensityHandler = utils.targetListener((t) => {
      this.scene.environment.intensity = +t.value;
      this.triggerRedraw();
      const envIntensity = this.scene.environment.intensity;
      updateDOMVal("envIntensityTxt", `${mR(10 ** envIntensity, 2)} (${mR(envIntensity, 2)})`);
    });
    utils.handleInputById("envIntensityRange", envIntensity.toString(), "onchange", envIntensityHandler);
    updateDOMVal("envIntensityTxt", `${mR(10 ** envIntensity, 2)} (${mR(envIntensity, 2)})`);

    this.initDOMInputsConfig();
  }

  initDOMInputsConfig() {
    const { blockType, blockColor, blockColor2, addStickers, faceColor } = this.config;

    const updateDOMVal = (id: string, val: number) => {
      utils.getElementById(id).innerText = val.toString();
    };

    const toggleStickerOptions = () => {
      const options = this.config.addStickers;
      utils.getElementById("faceStickerOptions").classList[options ? "remove" : "add"]("hidden");
    };

    const toggleBlockColorRadios = () => {
      const active = this.config.blockType;
      const inactive = active == "stickered" ? "stickerless" : "stickered";
      utils.getElementById(`blockColor_${active}`).classList.remove("hidden");
      utils.getElementById(`blockColor_${inactive}`).classList.add("hidden");
      this.config.addStickers = active == "stickered";
      utils.getInputById("addStickersCheck").checked = this.config.addStickers;
      toggleStickerOptions();
    };
    const blockTypeHandler = utils.targetListener((t) => {
      this.config.blockType = t.value == "blockTypeRadio_stickered" ? "stickered" : "stickerless";
      this.updateGeo(false, true, false);
      this.triggerRedraw();
      toggleBlockColorRadios();
    });
    utils.handleRadioByName("blockTypeRadio", `blockTypeRadio_${blockType}`, blockTypeHandler);
    toggleBlockColorRadios();

    const blockColorHandler = utils.targetListener((t) => {
      this.config.blockColor = t.value.split("_")[1];
      this.triggerRedraw();
    });
    utils.handleRadioByName("blockColorRadio", `blockColorRadio_${blockColor}`, blockColorHandler);

    const blockColorHandler2 = utils.targetListener((t) => {
      this.config.blockColor2 = t.value.split("_")[1];
      this.updateGeo(false, true, false);
      this.triggerRedraw();
    });
    utils.handleRadioByName("blockColorRadio2", `blockColorRadio_${blockColor2}`, blockColorHandler2);

    for (let id of ["block", "face"] as const) {
      const color = id == "block" ? "blockColor" : "faceColor";
      const colorCustom = id == "block" ? "blockColorCustom" : "faceColorCustom";
      const customColorHandler = utils.targetListener((t) => {
        this.config[colorCustom] = utils.hexToNRgb(t.value);
        this.config[color] = "custom";
        utils.getInputById(`${id}ColorRadio_custom`).checked = true;
        this.triggerRedraw();
      });
      utils.handleInputById(
        `${id}ColorInput`,
        utils.nRgbToHex(...this.config[colorCustom]),
        "onchange",
        customColorHandler
      );
    }

    for (let id of ["blockMetallic", "blockRoughness", "faceMetallic", "faceRoughness"] as const) {
      const handler = utils.targetListener((t) => {
        this.config[id] = +t.value;
        this.triggerRedraw();
        updateDOMVal(`${id}Txt`, this.config[id]);
      });

      utils.handleInputById(`${id}Range`, this.config[id].toString(), "onchange", handler);
      updateDOMVal(`${id}Txt`, this.config[id]);
    }

    const addStickersHandler = utils.targetListener((t) => {
      this.config.addStickers = t.checked;
      this.triggerRedraw();
      toggleStickerOptions();
    });
    utils.handleInputById("addStickersCheck", addStickers, "onclick", addStickersHandler);

    const faceColorHandler = utils.targetListener((t) => {
      this.config.faceColor = t.value.split("_")[1];
      const update = COLOR_SCHEMES.hasOwnProperty(this.config.faceColor);
      update && this.updateGeo(false, false, true);
      this.triggerRedraw();
    });
    utils.handleRadioByName("faceColorRadio", `faceColorRadio_${faceColor}`, faceColorHandler);
  }

  updateGeo(updateBlockData: boolean, updateBlocks: boolean, updateFaces: boolean) {
    if (updateBlockData) {
      this.updateBlockGeo();
    }
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

  private triggerRedraw() {
    this.scene.triggerRedraw();
  }

  private queueRotation(axis: Axis, level: Level, dir: Dir) {
    this.rotationQueue.push({ axis, level, dir, elapsedA: 0, elapsedT: 0, turns: 1 });
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

  private scramble() {
    this.scrambling = true;

    const levels = [Level.m1, Level.z0, Level.p1];
    const dirs = [Dir.ccw, Dir.cw];
    const randAxes = utils.shuffle([Axis.x, Axis.y, Axis.z]);

    for (let _ of Array(randInt(3) + 3)) {
      for (let axis of randAxes) {
        const level = levels[randInt(3)];
        const dir = dirs[randInt(2)];
        this.queueRotation(axis, level, dir);
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
      const { axis, level, dir, elapsedA, elapsedT, turns, reverse } = this.rotationQueue[0];
      const fullT = (this.scrambling ? 0.5 : 1) / this.speed;
      const t = elapsedT + dt;
      const a = clamp(utils.easeInOut(t, fullT, 90, this.animAlpha), 0, 90) + (elapsedA > 90 ? 90 : 0);
      const targetA = Math.max(a, elapsedA);
      const amt = (reverse ? -1 : 1) * Math.max(0, targetA - elapsedA);
      const isFinal = t >= fullT;

      this.rotateSlice(axis, level, dir, amt, isFinal, turns);

      if (isFinal) {
        this.rotationQueue.shift();
      } else {
        this.rotationQueue[0].elapsedA = targetA;
        this.rotationQueue[0].elapsedT = t;
      }

      if (!this.rotationQueue.length && this.scrambling) {
        this.scrambling = false;
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
    if (!this.rotationQueue.length) {
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
      const turns = mR(currAngle / 90);

      this.rotationQueue.push({ axis, level, dir, elapsedA, elapsedT, turns, reverse });

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
