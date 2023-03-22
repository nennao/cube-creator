/**
 *
 * based on Khronos gtlf pbr:
 * https://github.com/KhronosGroup/glTF-Sample-Viewer/tree/main/source/Renderer
 *
 * */

import { mat4 } from "gl-matrix";
import { Camera } from "../../../src/js/camera";
import { ShaderBase } from "../../../src/js/shader";

// @ts-ignore
import primitiveShader from "./shaders/primitive.vert";
// @ts-ignore
import pbrShader from "./shaders/pbr.frag";
// @ts-ignore
import utilsShader from "./shaders/utils.glsl";
// @ts-ignore
import materialInfoShader from "./shaders/material_info.glsl";
// @ts-ignore
import iblShader from "./shaders/ibl.glsl";
// @ts-ignore
import texturesShader from "./shaders/textures.glsl";
// @ts-ignore
import tonemappingShader from "./shaders/tonemapping.glsl";
// @ts-ignore
import shaderFunctions from "./shaders/functions.glsl";

// @ts-ignore
import VERT_MIN from "./vert.min.vert";
// @ts-ignore
import FRAG_MIN from "./frag.min.frag";

function completeShaderSrc(sources: Map<string, string>) {
  for (let [key, src] of sources) {
    let changed = false;
    for (let [includeName, includeSource] of sources) {
      //var pattern = RegExp(/#include</ + includeName + />/);
      const pattern = "#include <" + includeName + ">";

      if (src.includes(pattern)) {
        // only replace the first occurrence
        src = src.replace(pattern, includeSource);

        // remove the others
        while (src.includes(pattern)) {
          src = src.replace(pattern, "");
        }

        changed = true;
      }
    }

    if (changed) {
      sources.set(key, src);
    }
  }
}

function selectShader(sources: Map<string, string>, shaderIdentifier: string, permutationDefines: string[]) {
  const src = sources.get(shaderIdentifier);

  let defines = "#version 300 es\n";
  for (let define of permutationDefines) {
    // console.log(define);
    defines += "#define " + define + "\n";
  }

  return defines + src;
}

function getDebugDefines() {
  // prettier-ignore
  const views = {
     0: "DEBUG_NONE",
     1: "DEBUG_NORMAL_SHADING",
     2: "DEBUG_NORMAL_TEXTURE",
     3: "DEBUG_NORMAL_GEOMETRY",
     4: "DEBUG_TANGENT",
     5: "DEBUG_BITANGENT",
     6: "DEBUG_ALPHA",
     7: "DEBUG_UV_0",
     8: "DEBUG_OCCLUSION",
     9: "DEBUG_EMISSIVE",
    10: "DEBUG_METALLIC_ROUGHNESS",
    11: "DEBUG_BASE_COLOR",
    12: "DEBUG_ROUGHNESS",
    13: "DEBUG_METALLIC",
  };

  const defines = Object.entries(views).map(([i, v]) => v + " " + i);
  return [...defines, `DEBUG ${views[0]}`];
}

export class PBRShaderDebug extends ShaderBase {
  readonly vertexPosition: GLint;
  readonly vertexColor: GLint;
  readonly vertexNormal: GLint;

  constructor(gl: WebGL2RenderingContext) {
    const shaderSources = new Map<string, string>();
    shaderSources.set("primitive.vert", primitiveShader);
    shaderSources.set("pbr.frag", pbrShader);
    shaderSources.set("material_info.glsl", materialInfoShader);
    shaderSources.set("utils.glsl", utilsShader);
    shaderSources.set("ibl.glsl", iblShader);
    shaderSources.set("tonemapping.glsl", tonemappingShader);
    shaderSources.set("textures.glsl", texturesShader);
    shaderSources.set("functions.glsl", shaderFunctions);

    completeShaderSrc(shaderSources);
    const vsDefines: string[] = [];
    const fsDefines = getDebugDefines();
    // const fsDefines = vsDefines;
    const vsSrc = selectShader(shaderSources, "primitive.vert", vsDefines);
    const fsSrc = selectShader(shaderSources, "pbr.frag", fsDefines);

    super(gl, vsSrc, fsSrc);
    this.vertexPosition = this.lookupAttribLocationStrict("a_position");
    this.vertexColor = this.lookupAttribLocationStrict("a_color_0");
    this.vertexNormal = this.lookupAttribLocationStrict("a_normal");
  }

  setUniforms(camera: Camera) {
    this.setUniform("u_ViewProjectionMatrix", mat4.multiply(mat4.create(), camera.projectionMatrix, camera.viewMatrix));
    this.setUniform("u_Camera", camera.position);

    this.setUniform("u_Exposure", 1);
  }
}

export class PBRShader extends ShaderBase {
  readonly vertexPosition: GLint;
  readonly vertexColor: GLint;
  readonly vertexNormal: GLint;

  constructor(gl: WebGL2RenderingContext) {
    super(gl, VERT_MIN, FRAG_MIN);
    this.vertexPosition = this.lookupAttribLocationStrict("a_position");
    this.vertexColor = this.lookupAttribLocationStrict("a_color_0");
    this.vertexNormal = this.lookupAttribLocationStrict("a_normal");
  }

  setUniforms(camera: Camera) {
    this.setUniform("u_ViewProjectionMatrix", mat4.multiply(mat4.create(), camera.projectionMatrix, camera.viewMatrix));
    this.setUniform("u_Camera", camera.position);

    this.setUniform("u_Exposure", 1);
  }
}
