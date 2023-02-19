import { mat3, mat4, quat, vec2, vec3 } from "gl-matrix";

import { Camera } from "./camera";
import { Geometry } from "./geometry";
import { SimpleShader } from "./shader";
import { cubeData, extrudedRingData, roundedCubeData, squareData } from "./shapes";
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

function getFaceColors(faceId: FaceId, vertexCount: number): V3[] {
  // prettier-ignore
  // const colorMap = {
  //   [FaceId.L]: [0, 1, 1], [FaceId.R]: [1, 0, 0],
  //   [FaceId.D]: [1, 0, 1], [FaceId.U]: [0, 1, 0],
  //   [FaceId.B]: [1, 1, 0], [FaceId.F]: [0, 0, 1],
  // };
  const colorMap = {
    [FaceId.L]: [0.8, 0.4, 0.0], [FaceId.R]: [0.6, 0.0, 0.0],
    [FaceId.D]: [0.9, 0.9, 0.1], [FaceId.U]: [0.9, 0.9, 0.9],
    [FaceId.B]: [0.0, 0.2, 0.5], [FaceId.F]: [0.0, 0.4, 0.1],
  };
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
    const colors = getFaceColors(faceId, vertices.length);
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
  private readonly blockColor = [0.1, 0.1, 0.1];
  private _boundingBox: TriVec3[] = [];

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

    const [v, i, c] = this.initGeo();

    this._geometry = new Geometry(gl, v, c, i);
    this.faces = root.blockR < 1 ? this.createFaces() : [];
    this.initPosition();
  }

  initGeo() {
    const [v, i] = roundedCubeData(1, this.root.blockR);
    const colors: V3[] = Array(v.length).fill(this.blockColor);
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

  private rotateUpdatePosition(rotateFn: (pos: vec3) => vec3) {
    const rotatedPos = rotateFn(this.position);
    this.position = [mR(rotatedPos[0]), mR(rotatedPos[1]), mR(rotatedPos[2])];

    this.geometry.transform = mat4.create();
    this.updateFaces(rotateFn);

    this.initPosition();
  }

  private updateFaces(rotateFn: (pos: vec3) => vec3) {
    this.faces = this.faces.map((f) => {
      const a = f.axis;
      const s = f.side;
      const facePos = Array.from(rotateFn(getAxisVector(a, s))).map((p, i) => [mR(p), i]);
      for (let [p, i] of facePos) {
        if (p) {
          return new Face(this.gl, this, this.root, [Axis.x, Axis.y, Axis.z][i], p > 0 ? 1 : -1, f.faceId);
        }
      }
      console.error("error rotating face:", a, s, facePos);
      throw "error rotating face";
    });
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
      this.rotateUpdatePosition(rotateFn);
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
    this.root.shader.setUniform("u_BlockPosition", this.position);
    this.geometry.draw(this.root.shader);
    for (let face of this.faces) {
      face.draw();
    }
  }
}

export class Rubik {
  private readonly gl: WebGL2RenderingContext;
  private readonly scene: Scene;
  private readonly camera: Camera;
  readonly shader: SimpleShader;

  private readonly speed = 2; // turns/s
  private rotationQueue: RotQueueItem[] = [];

  transform = mat4.create();
  invTransform = mat4.create();
  invTransform3 = mat3.create();

  private readonly animAlpha = 2.25;
  private blocks: Block[];

  private scrambling = false;
  private showBounding = false;

  private boundingBox: [Axis, Side, TriVec3[]][] | undefined;
  private bounds: FaceBounds[] | undefined;

  manualBlockMoving = false;

  private moveBlockInfo: null | MoveInfo = null;
  private movedBlockInfo: null | MovedInfo = null;
  private clickedBlockInfo: null | ClickedInfo = null;

  blockRays = true;

  spread = 1.05;
  blockR = 0.15;
  faceCover = 0.75;
  faceR = 0.15;
  faceRingW = 1;
  faceExtrude = 0.005;

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

  constructor(gl: WebGL2RenderingContext, scene: Scene) {
    this.gl = gl;

    this.scene = scene;
    this.camera = scene.camera;
    this.shader = scene.cubeShader;

    this.updateBoundingBox();

    this.blocks = this.createBlocks();

    this.initDOMInputs();

    this.initialPosition();
  }

  private createBlocks() {
    const blocks = [];

    for (let x = -1; x < 2; x++) {
      for (let y = -1; y < 2; y++) {
        for (let z = -1; z < 2; z++) {
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
        const colors = getFaceColors(faceId, vertices.length);
        const x: [Axis, Side, TriVec3[]] = [axis, side, triangles];
        res.push(x);
        bounds.push(new FaceBounds(new Geometry(this.gl, vertices, colors, i), this));
      }
    }
    this.boundingBox = res;
    this.bounds = bounds;
  }

  private initDOMInputs() {
    utils.handleInputById(
      "blockRays",
      this.blockRays,
      "onclick",
      utils.targetListener((t) => {
        this.blockRays = t.checked;
        this.triggerRedraw();
      })
    );
    utils.handleInputById(
      "boundsCheck",
      this.showBounding,
      "onclick",
      utils.targetListener((t) => {
        this.showBounding = t.checked;
        this.triggerRedraw();
      })
    );
    utils.handleButtonById("scramble", "onclick", () => this.scramble());
    utils.handleButtonById("reset", "onclick", () => this.reset());

    utils.handleButtonById("sideMenuButton", "onclick", () => {
      const menu = document.getElementById("sideMenu")!;
      menu.classList.toggle("hidden");
    });

    utils.handleInputById(
      "spreadRange",
      ((this.spread - 1) * 20).toString(),
      "onchange",
      utils.targetListener((t) => {
        this.spread = mR(+t.value / 20 + 1, 6);
        this.updateBoundingBox();
        for (let block of this.blocks) block.updatePosition();
        this.triggerRedraw();
      })
    );

    for (let id of ["blockR", "faceCover", "faceR", "faceRingW", "faceExtrude"] as const) {
      const s = id == "faceExtrude" ? 200 : 20;
      const adjust = (val: number, get = false) => mR(get ? val / s : val * s, 6);

      utils.handleInputById(
        `${id}Range`,
        adjust(this[id]).toString(),
        "onchange",
        utils.targetListener((t) => {
          const prevCover = this.faceCoverAdj;
          this[id] = adjust(+t.value, true);
          this.updateGeo(id == "blockR", id != "blockR" || this.faceCoverAdj != prevCover);
          this.triggerRedraw();
        })
      );
    }
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
    this.rotate(35, [1, 0, 0]);
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
    let axis: Axis, level: Level, dir: Dir;

    if (this.movedBlockInfo) {
      ({ axis, level, side: dir } = this.movedBlockInfo);
    } else if (this.rotationQueue.length) {
      ({ axis, level, dir } = this.rotationQueue[0]);
    } else {
      return { currAngle: 0, axis: Axis.x, level: Level.z0, dir: Dir.ccw };
    }

    const block = this.blocks.find((block) => block.position[["x", "y", "z"].indexOf(axis)] == level);
    let blockAngle = block
      ? deg(Math.abs(quat.getAxisAngle(vec3.create(), mat4.getRotation(quat.create(), block.geometry.transform))))
      : 0;
    blockAngle = blockAngle > 180 ? 360 - blockAngle : blockAngle;
    const currAngle = block ? blockAngle : this.moveBlockInfo ? this.moveBlockInfo.currAngle : 0;
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
    this.shader.setUniform("u_Opacity", 1);
    for (let block of this.blocks) {
      block.draw();
    }
  }

  private drawBounds() {
    this.shader.setUniform("u_Opacity", 0.25);
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
  }

  draw() {
    this.shader.bind(this.camera);
    this.setUniforms();
    this.drawBlocks();
    if (this.showBounding) {
      this.drawBounds();
    }
  }
}
