import { mat4, vec3 } from "gl-matrix";

import { Camera } from "./camera";
import { Geometry } from "./geometry";
import { SimpleShader } from "./shader";
import { handleButtonById, mR, rad, randInt, shuffle } from "./utils";

type V3 = [number, number, number];

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

// prettier-ignore
const cubeData = () => {
  const vertices = [
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
    -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,
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
const squareData = (s = 1, z = 0):[V3[],number[]] => {
  const r = 0.5 * s;
  const vertices:V3[] = [
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
    this.vertices = this.orientFace(v, axis, side);
    this.indices = i;
    this.faceId = faceId || getFaceId(axis, side);
    this.colors = this.getFaceColor(this.faceId);

    this._geometry = new Geometry(gl, this.vertices, this.colors, this.indices);
  }

  private orientFace(vertices: V3[], axis: Axis, side: Side) {
    if (axis == Axis.z && side == 1) {
      return vertices.flat();
    }
    const rotateFn: (a: vec3, b: vec3, c: vec3, d: number) => vec3 = axis == Axis.y ? vec3.rotateX : vec3.rotateY;
    const angle = axis == Axis.z ? 180 : (axis == Axis.x && side == -1) || (axis == Axis.y && side == 1) ? -90 : 90;

    const res = vertices.map((v) => Array.from(rotateFn(vec3.create(), v, [0, 0, 0], rad(angle))));
    return res.flat();
  }

  private getFaceColor(faceId: FaceId) {
    // prettier-ignore
    const colorMap = {
      [FaceId.L]: [0, 1, 1], [FaceId.R]: [1, 0, 0],
      [FaceId.D]: [1, 0, 1], [FaceId.U]: [0, 1, 0],
      [FaceId.B]: [1, 1, 0], [FaceId.F]: [0, 0, 1],
    };
    const color = colorMap[faceId];
    return Array(this.vertices.length / 3)
      .fill(color)
      .flat();
  }

  draw() {
    this.geometry.draw(this.root.shader);
  }
}

class Block {
  private readonly gl: WebGL2RenderingContext;
  private readonly root: Rubik;
  private faces: Face[];
  position: vec3;
  private readonly spread = 1.1;
  private readonly vertices: number[];
  private readonly indices: number[];
  private readonly colors: number[];
  private readonly blockColor = [0.1, 0.1, 0.1];

  private readonly _geometry: Geometry;

  get geometry() {
    return this._geometry;
  }

  constructor(gl: WebGL2RenderingContext, root: Rubik, position: vec3) {
    this.gl = gl;
    this.initGL();

    this.root = root;
    this.position = position;

    const [v, i] = cubeData();
    this.vertices = v;
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

  displayTransform() {
    const spreadPos = vec3.scale(vec3.create(), this.position, this.spread);
    return vec3.transformMat4(vec3.create(), spreadPos, mat4.create());
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
    const displayPosition = this.displayTransform();
    const _initPos = (entity: Block | Face) => {
      mat4.translate(entity.geometry.transform, mat4.create(), displayPosition);
    };
    _initPos(this);
    this.faces.forEach(_initPos);
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

  private readonly speed = 180; // deg/s
  private rotationQueue: [Axis, Level, Dir, number][] = [];
  private mouse: null | { x: number; y: number } = null;

  transform = mat4.create();

  private blocks: Block[];

  private scrambling = false;

  constructor(gl: WebGL2RenderingContext, camera: Camera) {
    this.gl = gl;

    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
    this.gl.clearDepth(1);

    this.camera = camera;
    this.shader = new SimpleShader(gl);

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

  private initChangeWatcher() {
    const getters = [
      () => 0, // for dom ui
      () => this.camera.watcher,
    ];

    return getters.map((getter, i) => ({ val: i ? getter() : 1, get: getter }));
  }

  private initDOMInputs() {
    handleButtonById("scramble", "onclick", () => this.scramble());
    handleButtonById("reset", "onclick", () => this.reset());
  }

  private triggerRedraw() {
    this.changeWatcher[0].val = 1;
  }

  private queueRotation(axis: Axis, level: Level, dir: Dir) {
    this.rotationQueue.push([axis, level, dir, 90]);
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
    const randAxes = shuffle([Axis.x, Axis.y, Axis.z]);

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
      const angle = mR((this.scrambling ? 2 : 1) * this.speed * dt);
      const [axis, level, dir, rem] = this.rotationQueue[0];
      const amt = Math.min(angle, rem);
      const newRem = rem - angle;
      const isFinal = newRem <= 0;

      this.rotateSlice(axis, level, dir, amt, isFinal);

      if (isFinal) {
        this.rotationQueue.shift();
      } else {
        this.rotationQueue[0][3] = newRem;
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
        this.mouse = { x: e.clientX, y: e.clientY };
        window.addEventListener("pointermove", mousedownRotateHandler);
        window.addEventListener("pointerup", mouseupRotateHandler);
      }
    });
  }

  private drawBlocks() {
    for (let block of this.blocks) {
      block.draw();
    }
  }

  private draw() {
    this.shader.bind(this.camera);
    this.shader.setUniformMatrix4fv("u_RubikMatrix", this.transform);
    this.drawBlocks();
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
