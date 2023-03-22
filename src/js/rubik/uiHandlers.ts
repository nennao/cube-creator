import { vec2, vec3 } from "gl-matrix";

import { Block, Rubik } from "./index";
import { COLOR_SCHEMES, EPSILON, FACES, sceneConfigInit } from "./constsEnumsTypes";
import { Axis, ClickedInfo, ConfigUpdate, Dir, Level, MovedInfo, MoveInfo, Side } from "./constsEnumsTypes";
import {
  getAxisAndSide,
  getAxisVector,
  getConfigFromPreset,
  getPresetForSave,
  randomizer,
  sanitizeInput,
} from "./functions";
import { Preset, PRESETS } from "./presets";

import { Camera } from "../camera";
import { Scene } from "../scene";
import * as utils from "../utils";
import { acosC, deg, hexToNRgb, min, mR, nRgbToHex, vec3ToV3 } from "../utils";

function updateDOMVal(id: string, val: number | string) {
  utils.getElementById(id).innerText = val.toString();
}

export class ConfigUIHandler {
  private readonly cube: Rubik;
  private readonly scene: Scene;

  private preset = "classic";
  private userPresets: { [key: string]: Preset } = {};
  private presetToDelete: string | null = null;

  constructor(cube: Rubik, scene: Scene) {
    this.cube = cube;
    this.scene = scene;

    this.loadUserPresets();
    this.initDOMInputs();
    this.loadConfigFromPreset();
    this.generalUIUpdate({ ...this.cube.sceneConfig }, false);
  }

  private loadUserPresets() {
    const presets = JSON.parse(localStorage.getItem("userPresets") || "null");
    if (!presets) {
      localStorage.setItem("userPresets", "{}");
    } else {
      this.userPresets = presets;
    }
  }

  loadConfigFromPreset(preset?: Preset) {
    preset = preset || PRESETS[this.preset] || this.userPresets[this.preset] || PRESETS.classic;
    const update = getConfigFromPreset(preset);
    this.generalUIUpdate(update, false);
  }

  private deletePreset() {
    this.presetToDelete && delete this.userPresets[this.presetToDelete];
    if (this.preset == this.presetToDelete) {
      this.preset = "---";
    }
    this.presetToDelete = null;
    localStorage.setItem("userPresets", JSON.stringify(this.userPresets));
    this.updatePresetSelectUI();
  }

  private saveConfigToPreset() {
    const { cube } = this;
    const nameInp = utils.getInputById("saveName");
    const name = `(u)${nameInp.value || nameInp.placeholder}`;

    this.userPresets[name] = getPresetForSave(cube.geoConfig, cube.config);
    localStorage.setItem("userPresets", JSON.stringify(this.userPresets));

    nameInp.value = "";
    this.preset = name;
    this.updatePresetSelectUI();
  }

  private handleSaverUI(randName = false) {
    let name = this.preset;
    if (randName || name == "---") {
      let i = 1;
      name = `(u)random${i}`;
      while (this.userPresets[name]) {
        i++;
        name = `(u)random${i}`;
      }
    }

    utils.getInputById("saveName").placeholder = name.replace("(u)", "");
    this.handleSaverUIText(name);
  }

  private handleSaverUIText(name: string) {
    const overriding = !!this.userPresets[name];
    utils.getElementById("saveHelp").classList[overriding ? "remove" : "add"]("hidden");
    utils.getElementById("saveHelpNew").classList[overriding ? "add" : "remove"]("hidden");
  }

  updatePresetSelectUI() {
    const u = "(u)";
    utils.getElementById("presetChoice").innerHTML = this.preset.replace(u, "");

    const htmlStr =
      `<li><h6 class="dropdown-header">presets</h6></li>` +
      Object.keys(PRESETS)
        .map((p) => `<li><a id="${p}_preset" class="dropdown-item">${p}</a></li>`)
        .join("");
    const htmlStr2 =
      `<li><hr class="dropdown-divider"></li>
       <li><h6 class="dropdown-header">user presets</h6></li>` +
      Object.keys(this.userPresets)
        .map(
          (p) => `
          <li>
            <a id="${p}_preset" class="dropdown-item">
              ${p.replace(u, "")}
              <button class="btn2 trash-btn" id="${p}_del"  data-bs-toggle="modal" data-bs-target="#deleteModal">
                <span class="trash-icon"></span>
              </button>
            </a>
          </li>`
        )
        .join("");

    utils.getElementById("presetsSelect").innerHTML = htmlStr + (Object.keys(this.userPresets).length ? htmlStr2 : "");

    const activeOption = () => {
      document.querySelectorAll("#presetsSelect li a").forEach((n) => {
        n.classList.remove("active");
        this.preset == n.id.split("_")[0] && n.classList.add("active");
      });
    };
    activeOption();
    this.handleSaverUI();

    document.querySelectorAll("#presetsSelect li a").forEach((n) => {
      if (!(n instanceof HTMLAnchorElement)) return;
      n.onclick = (e) => {
        if (!(e.target instanceof HTMLAnchorElement)) return;
        this.preset = n.id.split("_")[0];

        utils.getElementById("presetChoice").innerHTML = this.preset.replace(u, "");
        activeOption();
        this.handleSaverUI();
        this.loadConfigFromPreset();
      };
    });

    document.querySelectorAll("#presetsSelect li a .trash-btn").forEach((n) => {
      if (!(n instanceof HTMLButtonElement)) return;
      n.onclick = () => {
        this.presetToDelete = n.id.split("_")[0];
        utils.getElementById("delName").innerHTML = this.presetToDelete.replace(u, "");
      };
    });
  }

  initDOMInputs() {
    const { cube } = this;

    const updater = (id: string, edit = true, num = true) =>
      utils.targetListener((t) => this.generalUIUpdate({ [id]: num ? +t.value : t.value }, edit));
    const updaterStr = (id: string) =>
      utils.targetListener((t) => this.generalUIUpdate({ [id]: t.value.split("_")[1] }));

    this.updatePresetSelectUI();

    for (let id of ["blockRays", "blockAO"] as const) {
      const handler = utils.targetListener((t) => {
        cube[id] = t.checked;
        this.scene.triggerRedraw();
      });
      utils.handleInputById(id, cube[id], "onclick", handler);
    }

    utils.handleButtonById("solve", "onclick", () => cube.solve());
    utils.handleButtonById("scramble", "onclick", () => cube.scramble());
    utils.handleButtonById("reset", "onclick", () => cube.reset());

    utils.handleButtonById("smButton", "onclick", () => utils.getElementById("sideMenuButton").classList.add("transp"));
    utils.handleButtonById("sideMenuClose", "onclick", () =>
      utils.getElementById("sideMenuButton").classList.remove("transp")
    );

    utils.handleButtonById("randomizer", "onclick", () => {
      utils.getElementById("presetChoice").innerHTML = "---";
      this.handleSaverUI(true);
      document.querySelectorAll("#presetsSelect li a").forEach((n) => {
        n.classList.remove("active");
      });
      this.loadConfigFromPreset(randomizer());
    });

    utils.handleButtonById("resetSettings", "onclick", () => {
      this.preset = "classic";
      this.presetToDelete = null;
      this.cube.resetCam();
      this.scene.camera.resetDist();
      this.scene.camera.resetAngle();
      this.loadConfigFromPreset();
      this.generalUIUpdate({ ...sceneConfigInit }, false);
    });

    const handleSaveNameChange = utils.targetListener((t) => {
      t.value = sanitizeInput(t.value);
      this.handleSaverUIText(`(u)${t.value}`);
    });
    utils.handleInputById("saveName", "", "oninput", handleSaveNameChange);

    utils.handleButtonById("delModalButton", "onclick", () => this.deletePreset());

    utils.handleButtonById("save", "onclick", () => this.saveConfigToPreset());

    utils.handleInputById("u_Debug", "0", "onchange", () => this.scene.triggerRedraw());

    // --- SCENE CONFIG ---
    utils.handleInputById("envColorInput", cube.sceneConfig.envColor, "onchange", updater("envColor", false, false));

    for (let id of ["envIntensity", "scrambleMoves", "scrambleSpeed", "solveSpeed"] as const) {
      utils.handleInputById(`${id}Range`, cube.sceneConfig[id].toString(), "onchange", updater(id, false));
    }

    // ---- GEO CONFIG ----
    // prettier-ignore
    for (let id of ["spread", "blockR", "bevelW", "faceCover", "faceR", "faceEdgeR", "faceRingW", "faceExtrude"] as const) {
            utils.handleInputById(`${id}Range`, cube.geoConfig[id].toString(), "onchange", updater(id));
        }

    // ------ CONFIG ------
    const { blockType, blockColor, blockColor2, addStickers, faceColor } = cube.config;

    utils.handleRadioByName("blockTypeRadio", `blockTypeRadio_${blockType}`, updaterStr("blockType"));

    utils.handleRadioByName("blockColorRadio", `blockColorRadio_${blockColor}`, updaterStr("blockColor"));

    const getColor6html = (ty: string, arr: string[]) =>
      arr
        .map(
          (f) => `
        <span>
          <label for="${ty}ColorInput_${f}">${f}</label> <input type="color" id="${ty}ColorInput_${f}" />
        </span>`
        )
        .join("");

    for (let type of ["block", "face"]) {
      const color = type == "block" ? "blockColor" : "faceColor";
      const colorCustom = type == "block" ? "blockColorCustom" : "faceColorCustom";
      const colorCustom6 = type == "block" ? "blockColorCustom6" : "faceColorCustom6";

      const handler = utils.targetListener((t) => {
        this.generalUIUpdate({ [colorCustom]: hexToNRgb(t.value), [color]: "custom" });
      });
      utils.handleInputById(`${type}ColorInput`, nRgbToHex(...cube.config[colorCustom]), "onchange", handler);

      utils.getElementById(`${type}ColorInputs6row1`).innerHTML = getColor6html(type, FACES.slice(0, 3));
      utils.getElementById(`${type}ColorInputs6row2`).innerHTML = getColor6html(type, FACES.slice(3, 6));

      FACES.forEach((f) => {
        const handler = utils.targetListener((t) => {
          this.generalUIUpdate({ [colorCustom6]: { ...cube.config[colorCustom6], [f]: hexToNRgb(t.value) } });
        });
        const col = cube.config[colorCustom6][f];
        utils.handleInputById(`${type}ColorInput_${f}`, nRgbToHex(...col), "onchange", handler);
      });
    }

    utils.handleRadioByName("blockColorRadio2", `blockColorRadio_${blockColor2}`, updaterStr("blockColor2"));

    for (let id of ["blockMetallic", "blockRoughness", "faceMetallic", "faceRoughness", "wearTear"] as const) {
      utils.handleInputById(`${id}Range`, cube.config[id].toString(), "onchange", updater(id));
    }

    const addStickersHandler = utils.targetListener((t) => this.generalUIUpdate({ addStickers: t.checked }));
    utils.handleInputById("addStickersCheck", addStickers, "onclick", addStickersHandler);

    utils.handleRadioByName("faceColorRadio", `faceColorRadio_${faceColor}`, updaterStr("faceColor"));
  }

  generalUIUpdate(config: ConfigUpdate, edited = true) {
    const { cube } = this;

    let [updateBlockGeo, updateFaceGeo, updateGeoBlocks, updateGeoFaces] = [false, false, false, false];

    if (config.spread) {
      cube.geoConfig.spread = config.spread;
      cube.updateBoundingBox();
      for (let block of cube.blocks) block.updatePosition();
      utils.getInputById("spreadRange").value = cube.geoConfig.spread.toString();
      updateDOMVal("spreadTxt", cube.geoConfig.spread);
    }

    for (let id of ["blockR", "bevelW", "faceCover", "faceR", "faceEdgeR", "faceRingW", "faceExtrude"] as const) {
      if (config[id] != undefined) {
        cube.geoConfig[id] = config[id]!;
        if (id == "blockR" || id == "bevelW") {
          updateBlockGeo = true;
          updateGeoBlocks = true;
        }
        updateFaceGeo = true;
        updateGeoFaces = true;
        utils.getInputById(`${id}Range`).value = cube.geoConfig[id].toString();
        updateDOMVal(`${id}Txt`, cube.geoConfig[id]);
      }
    }

    if (config.blockType) {
      cube.config.blockType = config.blockType;
      updateGeoBlocks = true;
      this.uiToggleBlockColorRadios();
      utils.getInputById(`blockTypeRadio_${cube.config.blockType}`).checked = true;
    }

    for (let type of ["block", "face"]) {
      const color = type == "block" ? "blockColor" : "faceColor";
      const colorCustom = type == "block" ? "blockColorCustom" : "faceColorCustom";
      const colorCustom6 = type == "block" ? "blockColorCustom6" : "faceColorCustom6";

      if (config[colorCustom] != undefined) {
        cube.config[colorCustom] = config[colorCustom]!;
        cube.config[color] = "custom";
        utils.getInputById(`${type}ColorRadio_custom`).checked = true;
        utils.getInputById(`${type}ColorInput`).value = nRgbToHex(...cube.config[colorCustom]);
      }

      if (config[colorCustom6] != undefined) {
        cube.config[colorCustom6] = config[colorCustom6]!;
        FACES.forEach((f) => {
          utils.getInputById(`${type}ColorInput_${f}`).value = nRgbToHex(...cube.config[colorCustom6][f]);
        });
        type == "face" && (updateGeoFaces = true);
        type == "block" && (updateGeoBlocks = true);
      }
    }

    if (config.blockColor != undefined) {
      cube.config.blockColor = config.blockColor;
      utils.getInputById(`blockColorRadio_${cube.config.blockColor}`).checked = true;
    }

    if (config.blockColor2 != undefined) {
      cube.config.blockColor2 = config.blockColor2;
      updateGeoBlocks = true;
      utils.getInputById(`blockColorRadio_${cube.config.blockColor2}`).checked = true;
      utils.getElementById("blockColorInputs6").classList[config.blockColor2 == "custom6" ? "remove" : "add"]("hidden");
    }

    for (let id of ["blockMetallic", "blockRoughness", "faceMetallic", "faceRoughness", "wearTear"] as const) {
      if (config[id] != undefined) {
        cube.config[id] = config[id]!;
        updateDOMVal(`${id}Txt`, cube.config[id]);
        utils.getInputById(`${id}Range`).value = cube.config[id].toString();
      }
    }

    if (config.addStickers != undefined) {
      cube.config.addStickers = config.addStickers;
      this.uiToggleStickerOptions();
      utils.getInputById("addStickersCheck").checked = cube.config.addStickers;
    }

    if (config.faceColor != undefined) {
      cube.config.faceColor = config.faceColor;
      const update = COLOR_SCHEMES.hasOwnProperty(cube.config.faceColor) || cube.config.faceColor == "custom6";
      update && (updateGeoFaces = true);
      utils.getInputById(`faceColorRadio_${cube.config.faceColor}`).checked = true;
      utils.getElementById("faceColorInputs6").classList[config.faceColor == "custom6" ? "remove" : "add"]("hidden");
    }

    if (config.envColor != undefined) {
      cube.sceneConfig.envColor = config.envColor;
      cube.scene.environment.color = cube.sceneConfig.envColor;
      utils.getInputById("envColorInput").value = config.envColor;
    }
    if (config.envIntensity != undefined) {
      cube.sceneConfig.envIntensity = config.envIntensity;
      cube.scene.environment.intensity = cube.sceneConfig.envIntensity;
      updateDOMVal("envIntensityTxt", config.envIntensity);
      utils.getInputById("envIntensityRange").value = config.envIntensity.toString();
    }
    for (let id of ["scrambleMoves", "scrambleSpeed", "solveSpeed"] as const) {
      if (config[id] != undefined) {
        cube.sceneConfig[id] = config[id]!;
        updateDOMVal(`${id}Txt`, cube.sceneConfig[id]);
        utils.getInputById(`${id}Range`).value = cube.sceneConfig[id].toString();
      }
    }

    const preset = utils.getElementById("presetChoice");
    if (edited && preset.innerHTML != "---" && !preset.innerHTML.endsWith("(edited)")) preset.innerHTML += " (edited)";

    updateBlockGeo && cube.updateBlockGeo();
    updateFaceGeo && cube.updateFaceGeo();
    (updateGeoBlocks || updateGeoFaces) && cube.updateGeo(updateGeoBlocks, updateGeoFaces);
    this.scene.triggerRedraw();
  }

  private uiToggleStickerOptions() {
    const show = this.cube.config.addStickers;
    utils.getElementById("faceStickerOptions").classList[show ? "remove" : "add"]("hidden");
  }

  private uiToggleBlockColorRadios() {
    const { cube } = this;
    const active = cube.config.blockType;
    const inactive = active == "stickered" ? "stickerless" : "stickered";
    utils.getElementById(`blockColor_${active}`).classList.remove("hidden");
    utils.getElementById(`blockColor_${inactive}`).classList.add("hidden");
    cube.config.addStickers = active == "stickered";
    utils.getInputById("addStickersCheck").checked = cube.config.addStickers;
    this.uiToggleStickerOptions();
  }
}

export class CubeUIHandler {
  private readonly cube: Rubik;
  private readonly camera: Camera;
  private readonly scene: Scene;

  private moveBlockInfo: null | MoveInfo = null;
  private movedBlockInfo: null | MovedInfo = null;
  private clickedBlockInfo: null | ClickedInfo = null;

  manualBlockMoving = false;

  constructor(cube: Rubik, scene: Scene) {
    this.cube = cube;
    this.camera = scene.camera;
    this.scene = scene;
  }

  private displayTransform(position: vec3) {
    return vec3.transformMat4(vec3.create(), position, this.cube.transformMat);
  }

  private inverseDisplayTransform(position: vec3) {
    return vec3.transformMat4(vec3.create(), position, this.cube.invTransformMat);
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

    if (!utils.rayCubeSphere(pNear, pFar, [0, 0, 0], this.cube.cubeR * 2)) {
      return false;
    }

    let cubeDist = Infinity;
    let clickedPlane: null | [Axis, Side, vec3] = null;

    for (let [axis, side, bBox] of this.cube.boundingPlanes) {
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

    for (let block of this.cube.blocks) {
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
      return this.handleClickedBlock([clickedAxis, clickedSide, closestBlock.position, p]);
    }
    return false;
  }

  private handleClickedBlock(clickedBlockInfo: [Axis, Side, vec3, vec3]) {
    if (!this.cube.rotating) {
      const [axis, side, blockPosition, p] = clickedBlockInfo;
      const normal = this.displayTransform(getAxisVector(axis, side));
      const center = vec3.scale(vec3.create(), normal, this.cube.cubeR);
      this.clickedBlockInfo = { axis, side, blockPosition, p, normal, center };
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
    const { axis, normal, blockPosition, center, p } = this.clickedBlockInfo;

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
    const level = blockPosition[minAxisIdx];

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
      this.cube.rotateSlice(axis2, level, side2, diff, false);
    } else {
      const angle = deg(acosC(vec3.dot(blockDir, newDir)));
      diff = angle - this.moveBlockInfo.currAngle;
      this.cube.rotateSlice(axis, level, side, diff, false);
    }

    this.moveBlockInfo.currAngle += diff;
    this.movedBlockInfo = { axis, level, side };
    this.scene.triggerRedraw();
  }

  private blockMoveAxisAndSide(blockDir1: vec3, blockDir2: vec3) {
    const rotAxis = vec3.cross(vec3.create(), blockDir1, blockDir2);
    vec3.normalize(rotAxis, this.inverseDisplayTransform(rotAxis));
    return getAxisAndSide(rotAxis);
  }

  getCurrentSliceMoveDetails() {
    const { cube } = this;
    let currAngle = this.moveBlockInfo ? this.moveBlockInfo.currAngle : 0;
    let axis: Axis, level: Level, dir: Dir;

    if (this.movedBlockInfo) {
      ({ axis, level, side: dir } = this.movedBlockInfo);
    } else if (cube.rotationsQueue.length) {
      ({ axis, level, dir } = cube.rotationsQueue[0]);
    } else {
      return { currAngle: 0, axis: Axis.x, level: Level.z0, dir: Dir.ccw };
    }

    const block = cube.blocks.find((block) => block.position[["x", "y", "z"].indexOf(axis)] == level);

    if (block) {
      const center = getAxisVector(axis, level * cube.spread);
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
    const { cube } = this;
    if (this.movedBlockInfo) {
      const { currAngle, axis, level, dir } = this.getCurrentSliceMoveDetails();

      const remA = currAngle - (currAngle > 90 ? 90 : 0);
      const reverse = remA < 45;
      const remElapsedA = reverse ? 90 - remA : remA;

      const elapsedT = utils.easeInOut(remElapsedA, 90, 1 / cube.speed, 1 / cube.animAlpha);
      const elapsedA = remElapsedA + (currAngle > 90 ? 90 : 0);
      const finalTurns = mR(currAngle / 90);

      cube.rotationsQueue.push({ axis, level, dir, elapsedA, elapsedT, turns: 1, finalTurns, reverse });

      this.scene.triggerRedraw();
    }
    this.manualBlockMoving = false;
    this.moveBlockInfo = null;
    this.movedBlockInfo = null;
  }
}
