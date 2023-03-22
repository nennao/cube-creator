import { mat3, mat4, vec3 } from "gl-matrix";

import { Resources, loadMaterialResources, setTexture } from "../../../lib/pbr/renderer/resource_handler";

import { initSolver, solve } from "./asyncSolver";
import { COLOR_SCHEMES, COLORS, COLORS_PROC, configInit, geoConfigInit, sceneConfigInit } from "./constsEnumsTypes";
import { Axis, Config, Dir, FaceId, GeoConfig, Level, RotQueueItem, SceneConfig, Side } from "./constsEnumsTypes";
import { getAxisAndSide, getAxisVector, getFaceColors, getFaceId, orientFace } from "./functions";

import { Camera } from "../camera";
import { Geometry } from "../geometry";
import { Scene } from "../scene";
import {
  addBevel,
  addFaceBevel,
  cubeData,
  extrudedRingData,
  roundedCubeData,
  splitCubeFaceData,
  squareData,
} from "../shapes";
import * as utils from "../utils";
import { clamp, mR, rad, randInt, TriVec3, V3, vec3ToV3 } from "../utils";

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

  private initGeo() {
    const { root, axis, side, faceId } = this;
    const { faceColor, faceColorCustom6 } = root.config;
    const [v, i, n, info] = this.root.faceGeoData;
    const vertices0 = orientFace(v, axis, side);
    const normals = orientFace(n, axis, side);

    const vertices = addFaceBevel(this.root.geoConfig.bevelW, this.block.origPosition, vertices0, info);

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

export class Block {
  private readonly gl: WebGL2RenderingContext;
  private readonly root: Rubik;
  readonly faces: Face[];
  position: vec3;
  readonly origPosition: V3;
  private _boundingBox: TriVec3[] = [];

  readonly faceRotation = mat3.create();
  private readonly _geometry: Geometry;

  get boundingBox(): TriVec3[] {
    return this._boundingBox.map((t) => utils.transformTriangle(t, this.root.transformMat));
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

  private initGeo() {
    const { blockType, blockColor2, blockColorCustom6 } = this.root.config;
    const stickerless = blockType == "stickerless";

    const pos = this.origPosition;

    let faces = pos.map((p, i) => (p < 0 ? i + 3 : i)).filter((_, i) => pos[i]);

    if (!faces.length) {
      faces = [0, 1, 2, 3, 4, 5];
    }

    const [v0, i] = stickerless ? splitCubeFaceData(...this.root.blockGeoData, faces) : this.root.blockGeoData;

    const v = addBevel(this.root.geoConfig.bevelW, this.root.geoConfig.blockR, pos, v0);

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
    this.root.shader.setUniform("u_BlockPositionOrig", this.origPosition);
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

  private drawFaces() {
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

export class Rubik {
  private readonly gl: WebGL2RenderingContext;
  readonly scene: Scene;
  private readonly camera: Camera;

  readonly speed = 2; // turns/s
  private rotationQueue: RotQueueItem[] = [];

  private transform = mat4.create();
  private invTransform = mat4.create();
  private readonly invTransform3 = mat3.create();

  readonly animAlpha = 2.25;
  blocks: Block[];

  private solving = false;
  private scrambling = false;

  private _blockGeoData: [V3[], V3[], number[][]] = [[], [], []];
  private _faceGeoData: [V3[], V3[], V3[], number[]] = [[], [], [], []];

  private boundingBox: [Axis, Side, TriVec3[]][] | undefined;

  private blockRays = true;
  blockAO = true;

  sceneConfig: SceneConfig = { ...sceneConfigInit };
  geoConfig: GeoConfig = { ...geoConfigInit };
  config: Config = { ...configInit };

  private resources?: Resources;

  get spread() {
    return Math.max(this.geoConfig.spread, 1.001);
  }

  get faceCoverAdj() {
    const blockSide = 1 - this.geoConfig.blockR;
    return this.geoConfig.faceCover * blockSide;
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

    loadMaterialResources(gl).then((resources) => {
      this.resources = resources;
      this.scene.materialsLoaded = true;
      this.scene.environment.setBG();
    });

    this.updateBoundingBox();

    this.updateFaceGeo();
    this.updateBlockGeo();
    this.blocks = this.createBlocks();

    this.initialPosition();
    initSolver();
  }

  get rotationsQueue() {
    return this.rotationQueue;
  }
  get transformMat() {
    return this.transform;
  }
  get invTransformMat() {
    return this.invTransform;
  }

  updateBlockGeo() {
    this._blockGeoData = roundedCubeData(1, this.geoConfig.blockR, this.geoConfig.bevelW);
  }

  get blockGeoData(): [V3[], V3[], number[][]] {
    const [v, i, s] = this._blockGeoData;
    return [[...v], [...i], [...s]];
  }

  updateFaceGeo() {
    const { faceCoverAdj } = this;
    const { faceR, faceRingW, faceExtrude, faceEdgeR, bevelW } = this.geoConfig;
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

  updateBoundingBox() {
    const res = [];
    const { cubeR } = this;

    for (let axis of [Axis.x, Axis.y, Axis.z]) {
      for (let side of [-1, 1] as const) {
        const [v, i] = squareData(cubeR * 2, cubeR);
        const vertices = orientFace(v, axis, side);
        const triangles = utils.getTriangles(vertices, i);
        const x: [Axis, Side, TriVec3[]] = [axis, side, triangles];
        res.push(x);
      }
    }
    this.boundingBox = res;
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

  solve() {
    if (this.rotating) {
      if (this.solving) {
        this.updateButtonCount("solve", true);
        this.rotationQueue = [this.rotationQueue[0]];
      }
      return;
    }
    const facelet = this.facesToFacelet();

    solve(facelet).then((res) => {
      this.solving = res.length > 0;
      res.forEach(([axis, level, dir, turns]) => this.queueRotation(axis, level, dir, turns));
      this.updateButtonCount("solve");
    });
  }

  scramble() {
    if (this.rotating) {
      if (this.scrambling) {
        this.updateButtonCount("scramble", true);
        this.rotationQueue = [this.rotationQueue[0]];
      }
      return;
    }

    this.scrambling = true;

    const levels = [Level.m1, Level.p1];
    const dirs = [Dir.ccw, Dir.cw];
    const axes = [Axis.x, Axis.y, Axis.z];

    let axis = axes[randInt(3)];

    for (let _ = 0; _ < this.sceneConfig.scrambleMoves; _++) {
      const level = levels[randInt(2)];
      const dir = dirs[randInt(2)];
      this.queueRotation(axis, level, dir, 1);
      axis = axes.filter((a) => a != axis)[randInt(2)];
    }
    this.updateButtonCount("scramble");
  }

  private updateButtonCount(key: string, stopping = false) {
    utils.getElementById(key).innerHTML = stopping
      ? "stopping"
      : this.rotationQueue.length
      ? `(${this.rotationQueue.length}) stop ${key}`
      : key;
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

  reset() {
    this.rotationQueue = [];
    this.scrambling = false;
    this.solving = false;
    this.blocks = this.createBlocks();
    this.updateButtonCount("scramble");
    this.updateButtonCount("solve");
    this.triggerRedraw();
  }

  update(dt: number) {
    this.runRotation(dt);
  }

  private runRotation(dt: number) {
    if (this.rotationQueue.length) {
      const { scrambleSpeed, solveSpeed } = this.sceneConfig;
      const { axis, level, dir, elapsedA, elapsedT, turns, finalTurns, reverse } = this.rotationQueue[0];
      const fullT = turns / (this.scrambling ? scrambleSpeed : this.solving ? solveSpeed : this.speed);
      const t = elapsedT + dt;
      const maxA = turns * 90;
      const a = clamp(utils.easeInOut(t, fullT, maxA, this.animAlpha), 0, maxA) + (elapsedA > maxA ? maxA : 0);
      const targetA = Math.max(a, elapsedA);
      const amt = (reverse ? -1 : 1) * Math.max(0, targetA - elapsedA);
      const isFinal = t >= fullT;

      this.rotateSlice(axis, level, dir, amt, isFinal, finalTurns);

      if (isFinal) {
        this.rotationQueue.shift();
        this.scrambling && this.updateButtonCount("scramble");
        this.solving && this.updateButtonCount("solve");
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

  rotateSlice(axis: Axis, level: Level, dir: Dir, amt: number, isFinal: boolean, turns = 1) {
    const axisId = ["x", "y", "z"].indexOf(axis);
    for (let block of this.blocks) {
      if (block.position[axisId] == level) {
        block.rotate(axis, dir, amt, isFinal, turns);
      }
    }
  }

  private drawBlocks() {
    for (let block of this.blocks) {
      block.draw();
    }
  }

  private setUniforms() {
    const { currAngle, axis, level, dir } = this.scene.getCurrentSliceMoveDetails();
    this.shader.setUniform("u_BlockR", this.geoConfig.blockR);
    this.shader.setUniform("u_BevelW", this.geoConfig.bevelW);
    this.shader.setUniform("u_NormalScale", this.config.wearTear);
    this.shader.setUniform("u_Spread", this.spread);
    this.shader.setUniform("u_CurrAngle", rad(currAngle) * dir);
    this.shader.setUniform("u_Axis", ["x", "y", "z"].indexOf(axis));
    this.shader.setUniform("u_Level", level);
    this.shader.setUniform("u_RubikMatrix", this.transform);
    this.shader.setUniform("u_RubikMatrixInv", mat3.fromMat4(this.invTransform3, this.invTransform));
    this.shader.setUniform("u_EnableBlocking", this.blockRays ? 1 : 0);
    this.shader.setUniform("u_Debug", +(utils.getElementById("u_Debug") as HTMLInputElement).value);
  }

  private applyMaterialTextures(texSlotOffset: number) {
    const { gl, resources: resources } = this;
    const { activeShader: shader } = this.scene;

    if (!resources) {
      return texSlotOffset;
    }

    const lookup = shader.lookupUniformLocation.bind(shader);

    setTexture(gl, lookup("u_NormalSampler0") || -1, resources, 0, texSlotOffset++);
    setTexture(gl, lookup("u_NormalSampler1") || -1, resources, 1, texSlotOffset++);
    setTexture(gl, lookup("u_NormalSampler2") || -1, resources, 2, texSlotOffset++);

    return texSlotOffset;
  }

  draw() {
    this.shader.bind(this.camera);

    let texSlot = 0;
    texSlot = this.scene.environment.applyEnvironmentMap(texSlot);
    this.applyMaterialTextures(texSlot);

    this.setUniforms();
    this.drawBlocks();
  }
}
