import { mat4, vec3 } from "gl-matrix";

import { Camera } from "./camera";
import { Geometry } from "./geometry";
import { SimpleShader } from "./shader";
import { clamp, mR, rad, randInt, TriVec3 } from "./utils";
import * as utils from "./utils";

type V3 = [number, number, number];

function vec3ToV3(v: vec3): V3 {
  return [v[0], v[1], v[2]];
}

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

function getFaceColors(faceId: FaceId, vertexCount: number) {
  // prettier-ignore
  const colorMap = {
    [FaceId.L]: [0, 1, 1], [FaceId.R]: [1, 0, 0],
    [FaceId.D]: [1, 0, 1], [FaceId.U]: [0, 1, 0],
    [FaceId.B]: [1, 1, 0], [FaceId.F]: [0, 0, 1],
  };
  const color = colorMap[faceId];
  return Array(vertexCount).fill(color).flat();
}

// prettier-ignore
const cubeData = (): [V3[], number[]] => {
  const vertices: V3[] = [
    [-0.5, -0.5,  0.5],  [ 0.5, -0.5,  0.5],   [0.5,  0.5,  0.5],  [-0.5,  0.5,  0.5],
    [-0.5, -0.5, -0.5],  [-0.5,  0.5, -0.5],   [0.5,  0.5, -0.5],  [ 0.5, -0.5, -0.5],
  ];
  const indices = [
    0, 1, 2,    0, 2, 3,
    7, 4, 5,    7, 5, 6,
    3, 2, 6,    3, 6, 5,
    4, 7, 1,    4, 1, 0,
    1, 7, 6,    1, 6, 2,
    4, 0, 3,    4, 3, 5,
  ]
  return [vertices, indices];
};

// prettier-ignore
const squareData = (s = 1, z = 0): [V3[], number[]] => {
  const r = 0.5 * s;
  const vertices: V3[] = [
    [-r, -r, z],
    [ r, -r, z],
    [ r,  r, z],
    [-r,  r, z],
  ]
  const indices = [
    0, 1, 2,    0, 2, 3,
  ]
  return [vertices, indices];
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
  private readonly epsilon = 0.01;
  private readonly gl: WebGL2RenderingContext;
  private readonly block: Block;
  private readonly root: Rubik;
  readonly axis: Axis;
  readonly side: Side;
  readonly faceId: FaceId;
  private readonly vertices: number[];
  private readonly indices: number[];
  private readonly colors: number[];

  private readonly _geometry: Geometry;

  get geometry() {
    return this._geometry;
  }

  constructor(gl: WebGL2RenderingContext, block: Block, root: Rubik, axis: Axis, side: Side, faceId?: FaceId) {
    this.gl = gl;
    this.block = block;
    this.root = root;
    const [v, i] = squareData(0.7, 0.5 + this.epsilon);

    this.axis = axis;
    this.side = side;
    this.vertices = orientFace(v, axis, side).flat();
    this.indices = i;
    this.faceId = faceId || getFaceId(axis, side);
    this.colors = getFaceColors(this.faceId, this.vertices.length / 3);

    this._geometry = new Geometry(gl, this.vertices, this.colors, this.indices);
    this.initPosition();
  }

  private initPosition() {
    mat4.translate(this.geometry.transform, mat4.create(), this.block.displayPosition);
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
  private readonly vertices: number[];
  private readonly indices: number[];
  private readonly colors: number[];
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
    this.initGL();

    this.root = root;
    this.position = position;

    const [v, i] = cubeData();
    this.vertices = v.flat();
    this.indices = i;
    this.colors = Array(this.vertices.length / 3 / 2)
      .fill(this.blockColor)
      .flat()
      .concat(
        Array(this.vertices.length / 3 / 2)
          .fill([0, 0, 0])
          .flat()
      );

    this._geometry = new Geometry(gl, this.vertices, this.colors, this.indices);
    this.faces = this.createFaces();
    this.initPosition();
  }

  private initGL() {
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.cullFace(this.gl.BACK);
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

  private updatePosition(rotateFn: (pos: vec3) => vec3) {
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

  rotate(axis: Axis, dir: Dir, amt: number, isFinal: boolean) {
    const axisV = getAxisVector(axis);

    if (isFinal) {
      const rotateFn = (pos: vec3) =>
        ({
          x: vec3.rotateX,
          y: vec3.rotateY,
          z: vec3.rotateZ,
        }[axis](vec3.create(), pos, axisV, rad(90 * dir)));
      this.updatePosition(rotateFn);
    } else {
      const angle = rad(amt * dir);
      const rotation = mat4.rotate(mat4.create(), mat4.create(), angle, axisV);
      const _rotate = (entity: Block | Face) => {
        mat4.multiply(entity.geometry.transform, rotation, entity.geometry.transform);
      };
      _rotate(this);
      this.faces.forEach(_rotate);
    }
  }

  draw() {
    this.geometry.draw(this.root.shader);
    for (let face of this.faces) {
      face.draw();
    }
  }
}

export class Rubik {
  private clock = 0;
  private readonly gl: WebGL2RenderingContext;
  readonly camera: Camera;
  readonly shader: SimpleShader;
  private readonly changeWatcher: { val: any; get: () => any }[];

  private readonly speed = 2; // turns/s
  private rotationQueue: [Axis, Level, Dir, number, number][] = [];
  private mouse: null | { x: number; y: number } = null;

  transform = mat4.create();

  readonly spread = 1.1;
  private blocks: Block[];

  private scrambling = false;
  private showBounding = false;

  private readonly boundingBox: [Axis, Side, TriVec3[]][];
  private readonly bounds: FaceBounds[];

  get cubeR() {
    return 0.5 * (3 + 2 * (this.spread - 1));
  }

  get boundingPlanes(): [Axis, Side, TriVec3[]][] {
    return this.boundingBox.map(([axis, side, triangles]) => [
      axis,
      side,
      triangles.map((t) => utils.transformTriangle(t, this.transform)),
    ]);
  }

  constructor(gl: WebGL2RenderingContext, camera: Camera) {
    this.gl = gl;

    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
    this.gl.clearDepth(1);

    this.camera = camera;
    this.shader = new SimpleShader(gl);

    const [bBox, bBounds] = this.getBoundingBox();
    this.boundingBox = bBox;
    this.bounds = bBounds;

    this.blocks = this.createBlocks();
    this.changeWatcher = this.initChangeWatcher();
    this.initDOMInputs();
    this.handleInputEvents();

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

  private getBoundingBox(): [[Axis, Side, TriVec3[]][], FaceBounds[]] {
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
        bounds.push(new FaceBounds(new Geometry(this.gl, vertices.flat(), colors, i), this));
      }
    }
    return [res, bounds];
  }

  private initChangeWatcher() {
    const getters = [
      () => 0, // for dom ui
      () => this.camera.watcher,
    ];

    return getters.map((getter, i) => ({ val: i ? getter() : 1, get: getter }));
  }

  private initDOMInputs() {
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
  }

  private triggerRedraw() {
    this.changeWatcher[0].val = 1;
  }

  private queueRotation(axis: Axis, level: Level, dir: Dir) {
    this.rotationQueue.push([axis, level, dir, 0, 0]);
  }

  private rotate(angle: number, rotAxis: vec3) {
    const rotation = mat4.rotate(mat4.create(), mat4.create(), rad(angle), rotAxis);
    mat4.multiply(this.transform, rotation, this.transform);
    this.triggerRedraw();
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

  private reset() {
    this.rotationQueue = [];
    this.scrambling = false;
    this.transform = mat4.create();
    this.blocks = this.createBlocks();
    this.initialPosition();
    this.triggerRedraw();
  }

  private runRotation(dt: number) {
    if (this.rotationQueue.length) {
      const [axis, level, dir, elapsedA, elapsedT] = this.rotationQueue[0];
      const fullT = (this.scrambling ? 0.5 : 1) / this.speed;
      const t = elapsedT + dt;
      const targetA = Math.max(clamp(utils.easeInOut(t, fullT, 90, 2.25), 0, 90), elapsedA);
      const amt = Math.max(0, targetA - elapsedA);
      const isFinal = t >= fullT;

      this.rotateSlice(axis, level, dir, amt, isFinal);

      if (isFinal) {
        this.rotationQueue.shift();
      } else {
        this.rotationQueue[0][3] = targetA;
        this.rotationQueue[0][4] = t;
      }

      if (!this.rotationQueue.length && this.scrambling) {
        this.scrambling = false;
      }
      this.triggerRedraw();
    }
  }

  private rotateSlice(axis: Axis, level: Level, dir: Dir, amt: number, isFinal: boolean) {
    const axisId = ["x", "y", "z"].indexOf(axis);
    for (let block of this.blocks) {
      if (block.position[axisId] == level) {
        block.rotate(axis, dir, amt, isFinal);
      }
    }
  }

  private displayTransform(position: vec3) {
    return vec3.transformMat4(vec3.create(), position, this.transform);
  }

  private findClickedBlock(x: number, y: number): [Axis | null, Side | null, Block | null] {
    let closestDist = Infinity;
    let clickedAxis: null | Axis = null;
    let clickedSide: null | Side = null;
    let closestBlock: null | Block = null;

    const pNear = this.camera.position;
    const pFar = this.camera.getPickedVector(x, y);

    if (!utils.rayCubeSphere(pNear, pFar, [0, 0, 0], this.cubeR * 2)) {
      return [null, null, null];
    }

    let cubeDist = Infinity;
    let clickedPlane: null | [Axis, Side] = null;

    for (let [axis, side, bBox] of this.boundingPlanes) {
      for (let triangle of bBox) {
        const intersection = utils.rayTriangle(pNear, pFar, triangle);
        if (!intersection) {
          continue;
        }
        const dist = vec3.distance(intersection, this.camera.position);
        if (dist < cubeDist) {
          cubeDist = dist;
          clickedPlane = [axis, side];
        }
      }
    }

    if (!clickedPlane) {
      return [null, null, null];
    }

    const [axis, side] = clickedPlane;
    clickedAxis = axis;
    clickedSide = side;
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

    return [clickedAxis, clickedSide, closestBlock];
  }

  private handleInputEvents() {
    const canvas = this.gl.canvas;

    const mousedownRotateHandler = (e: PointerEvent) => {
      if (this.mouse) {
        const cap = (n: number) => Math.min(n, 2);
        this.rotate(cap(e.clientY - this.mouse.y), [1, 0, 0]);
        this.rotate(cap(e.clientX - this.mouse.x), [0, 1, 0]);
      }
      this.mouse = { x: e.clientX, y: e.clientY };
    };

    const mouseupRotateHandler = () => {
      window.removeEventListener("pointermove", mousedownRotateHandler);
      window.removeEventListener("pointerup", mouseupRotateHandler);
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.buttons == 1) {
        const [clickedAxis, clickedSide, closestBlock] = this.findClickedBlock(e.clientX, e.clientY);
        console.log(closestBlock ? clickedAxis! + clickedSide! : "no face", closestBlock ? closestBlock.position : "");
        this.mouse = { x: e.clientX, y: e.clientY };
        window.addEventListener("pointermove", mousedownRotateHandler);
        window.addEventListener("pointerup", mouseupRotateHandler);
      }
    });
  }

  private drawBlocks() {
    this.shader.setUniform1f("u_Opacity", 1);
    for (let block of this.blocks) {
      block.draw();
    }
  }

  private drawBounds() {
    this.shader.setUniform1f("u_Opacity", 0.25);
    for (let bound of this.bounds) {
      bound.draw();
    }
  }

  private draw() {
    this.shader.bind(this.camera);
    this.shader.setUniformMatrix4fv("u_RubikMatrix", this.transform);
    this.drawBlocks();
    if (this.showBounding) {
      this.drawBounds();
    }
  }

  private uiWatch() {
    for (let watcher of this.changeWatcher) {
      if (watcher.val != watcher.get()) {
        watcher.val = watcher.get();
        return true;
      }
    }
    return false;
  }

  render(t: number) {
    const dt = t - this.clock;
    this.runRotation(dt);

    const play = this.uiWatch();

    this.clock = t;

    if (play) {
      this.camera.update();

      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      this.draw();
    }
  }
}
