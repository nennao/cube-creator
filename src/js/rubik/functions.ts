import { vec3 } from "gl-matrix";

import { COLORS, COLORS_PROC, COLOR_SCHEMES, FACES } from "./constsEnumsTypes";
import { Axis, ColorSet, Config, ConfigUpdate, FaceId, GeoConfig, Side } from "./constsEnumsTypes";

import { faceDefaults, Preset, presetDefault } from "./presets";
import { hexToNRgb, max, mR, nRgbToHex, rad, randExp, randInt, V3, vec3ToV3 } from "../utils";

export function getAxisVector(axis: Axis, s = 1): V3 {
  return [axis == Axis.x ? s : 0, axis == Axis.y ? s : 0, axis == Axis.z ? s : 0];
}

export function getAxisAndSide(v: vec3): [Axis, Side] {
  const v2 = vec3ToV3(v).map((val, i) => [val, i]);
  const [val, idx] = max(v2, (k) => Math.abs(k[0]));
  return [[Axis.x, Axis.y, Axis.z][idx], val > 0 ? 1 : -1];
}

export function getFaceId(axis: Axis, side: Side): FaceId {
  return {
    x: { "-1": FaceId.L, "1": FaceId.R },
    y: { "-1": FaceId.D, "1": FaceId.U },
    z: { "-1": FaceId.B, "1": FaceId.F },
  }[axis][side];
}

export function orientFace(vertices: V3[], axis: Axis, side: Side): V3[] {
  if (axis == Axis.z && side == 1) {
    return vertices;
  }
  const rotateFn: (a: vec3, b: vec3, c: vec3, d: number) => vec3 = axis == Axis.y ? vec3.rotateX : vec3.rotateY;
  const angle = axis == Axis.z ? 180 : (axis == Axis.x && side == -1) || (axis == Axis.y && side == 1) ? -90 : 90;

  return vertices.map((v) => vec3ToV3(rotateFn(vec3.create(), v, [0, 0, 0], rad(angle))));
}

export function getFaceColors(faceId: FaceId, vertexCount: number, scheme: string): V3[] {
  const colorMap = COLOR_SCHEMES[scheme] || COLOR_SCHEMES.classic;
  const color = colorMap[faceId];
  return Array(vertexCount).fill(color);
}

export const randomizer = (): Preset => {
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
    bevelW: r() < 0.5 ? 0 : mR(randExp(4) * 0.5, 2),

    blockType,
    blockColor,
    blockMetallic: [0, 0, 0.5, 1, 1][randInt(5)],
    blockRoughness: r(0.5),

    addStickers,
    ...faceOptions,
    wearTear: mR(randExp(2), 2),
  };
};

export function sanitizeInput(val: string) {
  const res = [];
  for (let a of val) {
    const code = a.charCodeAt(0);
    if (
      (code > 47 && code < 58) || // numeric (0-9)
      (code > 64 && code < 91) || // upper alpha (A-Z)
      (code > 96 && code < 123) // lower alpha (a-z)
    ) {
      res.push(a);
      if (res.length == 16) break;
    }
  }
  return res.join("");
}

export function getConfigFromPreset(preset: Preset) {
  const update: ConfigUpdate = {
    spread: preset.spread,
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

    wearTear: preset.wearTear,
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

  return update;
}

export function getPresetForSave(geoConfig: GeoConfig, config: Config) {
  // @ts-ignore
  new bootstrap.Collapse("#accBody-savePresets").hide();

  const { spread, blockR, bevelW, faceCover, faceR, faceEdgeR, faceRingW, faceExtrude } = geoConfig;
  const { blockType, blockColor, blockColorCustom, blockColor2, blockColorCustom6, blockMetallic, blockRoughness } =
    config;
  const { addStickers, faceColor, faceColorCustom, faceColorCustom6, faceMetallic, faceRoughness, wearTear } = config;

  const custom6ToStrArr = (c: ColorSet) => FACES.map((f) => c[f]).map((f) => nRgbToHex(...f));

  // prettier-ignore
  const preset:Preset = {
    ...presetDefault,

    spread, blockR, bevelW, ...(addStickers ? { faceCover, faceR, faceEdgeR, faceRingW, faceExtrude } : {}), blockType,
    blockColor: blockType == "stickered" ? blockColor == "custom" ? nRgbToHex(...blockColorCustom) : blockColor
        : blockColor2 == "custom6" ? custom6ToStrArr(blockColorCustom6) : blockColor2,
    blockMetallic, blockRoughness,
    addStickers,
    ...(addStickers ? {
      faceColor: faceColor == "custom6" ? custom6ToStrArr(faceColorCustom6)
          : faceColor == "custom" ? nRgbToHex(...faceColorCustom) : faceColor, faceMetallic, faceRoughness} : {}),
    wearTear,
  };

  return preset;
}
