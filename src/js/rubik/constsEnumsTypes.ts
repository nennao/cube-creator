import { vec3 } from "gl-matrix";
import { ShallowNormalsInfo, V3 } from "../utils";

// -------- ENUMS --------
export enum FaceId {
  L = "L",
  R = "R",
  D = "D",
  U = "U",
  B = "B",
  F = "F",
}

export enum Axis {
  x = "x",
  y = "y",
  z = "z",
}

export enum Level {
  m1 = -1,
  z0 = 0,
  p1 = 1,
}

export enum Dir {
  ccw = 1,
  cw = -1,
}

// -------- TYPES --------
export type Side = 1 | -1;

export type ColorSet = { R: V3; U: V3; F: V3; L: V3; D: V3; B: V3 };

export type ClickedInfo = {
  axis: Axis;
  side: Side;
  blockPosition: vec3;
  p: vec3;
  normal: vec3;
  center: vec3;
};

export type MoveInfo = {
  currAngle: number;
  level: Level;
  normal: vec3;
  center: vec3;
  blockDir: vec3;
  shallowNormals?: ShallowNormalsInfo;
};

export type MovedInfo = {
  axis: Axis;
  level: Level;
  side: Side;
};

export type RotQueueItem = {
  axis: Axis;
  level: Level;
  dir: Dir;
  elapsedA: number;
  elapsedT: number;
  turns: number;
  finalTurns: number;
  reverse?: boolean;
};

export type GeoConfig = {
  spread: number;
  blockR: number;
  bevelW: number;
  faceCover: number;
  faceR: number;
  faceEdgeR: number;
  faceRingW: number;
  faceExtrude: number;
};

export type Config = {
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
  wearTear: number;
};

export type SceneConfig = {
  envIntensity: number;
  envColor: string;
  scrambleMoves: number;
  scrambleSpeed: number;
  solveSpeed: number;
};

export type ConfigUpdate = {
  spread?: number;
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

  wearTear?: number;

  envIntensity?: number;
  envColor?: string;
  scrambleMoves?: number;
  scrambleSpeed?: number;
  solveSpeed?: number;
};

// -------- CONSTS --------
export const EPSILON = 0.0000001;

export const FACES = [FaceId.F, FaceId.U, FaceId.R, FaceId.B, FaceId.D, FaceId.L] as const;

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

export const COLOR_SCHEMES: { [key: string]: ColorSet } = {
  classic: COLORS_CLASSIC,
  bright: COLORS_BRIGHT,
  neutral: COLORS_NEUTRAL,
  pastel: COLORS_PASTEL,
};

export const COLORS: { [key: string]: [number, number, number] } = {
  bl: [0.08, 0.08, 0.08],
  st: [0.42, 0.42, 0.42],
  si: [0.594, 0.588, 0.576],
  go: [0.6, 0.54, 0.36],
  rg: [0.6, 0.42, 0.36],
};

export const COLORS_PROC: { [key: string]: number } = {
  colorful: 1,
};

export const geoConfigInit: GeoConfig = {
  spread: 1,
  blockR: 0.15,
  bevelW: 0,
  faceCover: 0.85,
  faceR: 0.15,
  faceEdgeR: 0.5,
  faceRingW: 1,
  faceExtrude: 0.005,
};

export const configInit: Config = {
  blockType: "stickered",
  blockColor: "bl",
  blockColorCustom: [1, 0.5, 0.5],
  blockColor2: "classic",
  blockColorCustom6: { ...COLORS_CLASSIC },
  blockMetallic: 0,
  blockRoughness: 0.25,

  addStickers: true,
  faceColor: "classic",
  faceColorCustom: [1, 0.5, 0.5],
  faceColorCustom6: { ...COLORS_CLASSIC },
  faceMetallic: 0,
  faceRoughness: 0.25,

  wearTear: 0.5,
};

export const sceneConfigInit: SceneConfig = {
  envIntensity: -0.2,
  envColor: "#808080",
  scrambleMoves: 20,
  scrambleSpeed: 4,
  solveSpeed: 3,
};
