export type Preset = {
  spread: number;
  blockR: number;
  bevelW: number;
  faceCover: number;
  faceR: number;
  faceEdgeR: number;
  faceRingW: number;
  faceExtrude: number;

  blockType: "stickered" | "stickerless";
  blockColor: string | string[];
  blockMetallic: number;
  blockRoughness: number;

  addStickers: boolean;
  faceColor: string | string[];
  faceMetallic: number;
  faceRoughness: number;

  wearTear: number;
};

export const faceDefaults = {
  faceCover: 0.85,
  faceR: 0.15,
  faceEdgeR: 0.5,
  faceRingW: 1,
  faceExtrude: 0.005,
  faceColor: "classic",
  faceMetallic: 0,
  faceRoughness: 0.15,
};

export const presetDefault: Preset = {
  spread: 1,
  blockR: 0.15,
  bevelW: 0,

  blockType: "stickered",
  blockColor: "bl",
  blockMetallic: 0,
  blockRoughness: 0.15,

  addStickers: false,

  ...faceDefaults,

  wearTear: 0.2,
};

const classic1: Preset = {
  spread: 1.025,
  blockR: 0.15,
  bevelW: 0,
  faceCover: 0.85,
  faceR: 0.15,
  faceEdgeR: 0.5,
  faceRingW: 1,
  faceExtrude: 0.005,

  blockType: "stickered",
  blockColor: "bl",
  blockMetallic: 0,
  blockRoughness: 0.15,

  addStickers: true,
  faceColor: "classic",
  faceMetallic: 0,
  faceRoughness: 0.15,

  wearTear: 0.2,
};

const classic2: Preset = {
  spread: 1,
  blockR: 0.1,
  bevelW: 0.2,
  faceCover: 0.95,
  faceR: 0.1,
  faceEdgeR: 0.5,
  faceRingW: 1,
  faceExtrude: 0.005,

  blockType: "stickered",
  blockColor: "bl",
  blockMetallic: 0,
  blockRoughness: 0.05,

  addStickers: true,
  faceColor: "classic",
  faceMetallic: 0,
  faceRoughness: 0.15,

  wearTear: 0.2,
};

const reverse: Preset = {
  spread: 1.025,
  blockR: 0.15,
  bevelW: 0,
  faceCover: 0.85,
  faceR: 0.15,
  faceEdgeR: 0.5,
  faceRingW: 1,
  faceExtrude: 0.005,

  blockType: "stickerless",
  blockColor: "classic",
  blockMetallic: 0,
  blockRoughness: 0.05,

  addStickers: true,
  faceColor: "bl",
  faceMetallic: 0,
  faceRoughness: 0.05,

  wearTear: 0.2,
};

const reverse2: Preset = {
  spread: 1,
  blockR: 0.1,
  bevelW: 0.2,
  faceCover: 0.95,
  faceR: 0.1,
  faceEdgeR: 0.5,
  faceRingW: 1,
  faceExtrude: 0.005,

  blockType: "stickerless",
  blockColor: "classic",
  blockMetallic: 0,
  blockRoughness: 0.15,

  addStickers: true,
  faceColor: "bl",
  faceMetallic: 0,
  faceRoughness: 0.05,

  wearTear: 0.2,
};

const toy: Preset = {
  spread: 1,
  blockR: 0.15,
  bevelW: 0.15,

  blockType: "stickerless",
  blockColor: "bright",
  blockMetallic: 0,
  blockRoughness: 0.1,

  addStickers: false,

  ...faceDefaults,

  wearTear: 0.2,
};

const precious: Preset = {
  spread: 1.05,
  blockR: 0.1,
  bevelW: 0,
  faceCover: 0.85,
  faceR: 1,
  faceEdgeR: 1,
  faceRingW: 0.35,
  faceExtrude: 0.07,

  blockType: "stickered",
  blockColor: "go",
  blockMetallic: 1,
  blockRoughness: 0.05,

  addStickers: true,
  faceColor: "bright",
  faceMetallic: 1,
  faceRoughness: 0.15,

  wearTear: 0.2,
};

const bubble: Preset = {
  spread: 1,
  blockR: 1,
  bevelW: 0,

  blockType: "stickerless",
  blockColor: "bright",
  blockMetallic: 0,
  blockRoughness: 0.1,

  addStickers: false,

  ...faceDefaults,

  wearTear: 0.2,
};

const retro1: Preset = {
  spread: 1,
  blockR: 0.25,
  bevelW: 0,
  faceCover: 0.9,
  faceR: 0.4,
  faceEdgeR: 0.5,
  faceRingW: 0.35,
  faceExtrude: 0.02,

  blockType: "stickered",
  blockColor: "#292929",
  blockMetallic: 0,
  blockRoughness: 0.05,

  addStickers: true,
  faceColor: "neutral",
  faceMetallic: 0,
  faceRoughness: 0.15,

  wearTear: 0.5,
};

const retro2: Preset = {
  spread: 1,
  blockR: 0.05,
  bevelW: 0.2,
  faceCover: 0.95,
  faceR: 0.15,
  faceEdgeR: 0.5,
  faceRingW: 0.07,
  faceExtrude: 0,

  blockType: "stickered",
  blockColor: "bl",
  blockMetallic: 0,
  blockRoughness: 0.3,

  addStickers: true,
  faceColor: "pastel",
  faceMetallic: 0,
  faceRoughness: 0.1,

  wearTear: 0.75,
};

const framed: Preset = {
  spread: 1.025,
  blockR: 0,
  bevelW: 0,
  faceCover: 1,
  faceR: 0.05,
  faceEdgeR: 1,
  faceRingW: 0.15,
  faceExtrude: 0.05,

  blockType: "stickerless",
  blockColor: "bright",
  blockMetallic: 0,
  blockRoughness: 0.15,

  addStickers: true,
  faceColor: "si",
  faceMetallic: 1,
  faceRoughness: 0.05,

  wearTear: 0.2,
};

const colorful: Preset = {
  spread: 1.025,
  blockR: 0.15,
  bevelW: 0,
  faceCover: 0.85,
  faceR: 0.35,
  faceEdgeR: 0.5,
  faceRingW: 0.13,
  faceExtrude: 0.01,

  blockType: "stickered",
  blockColor: "colorful",
  blockMetallic: 0,
  blockRoughness: 0.15,

  addStickers: true,
  faceColor: "bright",
  faceMetallic: 0,
  faceRoughness: 0.15,

  wearTear: 0.2,
};

const unicorn: Preset = {
  spread: 1,
  blockR: 1,
  bevelW: 0,

  blockType: "stickered",
  blockColor: "colorful",
  blockMetallic: 0.5,
  blockRoughness: 0.25,

  addStickers: false,

  ...faceDefaults,

  wearTear: 0.2,
};

const lego: Preset = {
  spread: 1,
  blockR: 0.05,
  bevelW: 0,
  faceCover: 0.4,
  faceR: 1,
  faceEdgeR: 0.2,
  faceRingW: 1,
  faceExtrude: 0.1,

  blockType: "stickerless",
  blockColor: "neutral",
  blockMetallic: 0,
  blockRoughness: 0.1,

  addStickers: true,
  faceColor: "neutral",
  faceMetallic: 0,
  faceRoughness: 0.1,

  wearTear: 0.2,
};

const fancy: Preset = {
  spread: 1.03,
  blockR: 0.05,
  bevelW: 0.32,
  blockType: "stickerless",
  blockColor: "pastel",
  blockMetallic: 0,
  blockRoughness: 0.38,

  addStickers: true,
  faceCover: 0.98,
  faceR: 0.15,
  faceEdgeR: 0.72,
  faceRingW: 0.67,
  faceExtrude: 0.023,
  faceColor: "go",
  faceMetallic: 0.5,
  faceRoughness: 0.23,

  wearTear: 0.2,
};

export const PRESETS: { [key: string]: Preset } = {
  classic1,
  classic2,
  reverse,
  reverse2,
  toy,
  precious,
  bubble,
  framed,
  colorful,
  retro1,
  retro2,
  unicorn,
  lego,
  fancy,
};
