/**
 *
 * adapted from:
 * https://github.com/KhronosGroup/glTF-Sample-Viewer/ ibl_sampler.js
 *
 * */

import { ShaderBase } from "../../src/js/shader";

// @ts-ignore
import FS_SRC_IBL from "./shaders/ibl_filtering.frag";
// @ts-ignore
import FS_SRC_PANO from "./shaders/panorama_to_cubemap.frag";
// @ts-ignore
import VS_SRC from "./shaders/fullscreen.vert";

function floatRgbaToRgb(buffer) {
  const length = buffer.byteLength >> 2;
  const result = new Float32Array(length * 3);

  for (let i = 0; i < length; i++) {
    result[i * 3 + 0] = buffer[i * 4 + 0];
    result[i * 3 + 1] = buffer[i * 4 + 1];
    result[i * 3 + 2] = buffer[i * 4 + 2];
  }
  return result;
}

function magnify(image) {
  const { dataFloat: data, width: w, height: h } = image;
  const buffer = new Float32Array(2 * w * 2 * h * 3);
  const result = {
    dataFloat: buffer,
    width: 2 * w,
    height: 2 * h,
  };

  const getIdx = (c, x, y) => 3 * (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) + c;

  let newIdx = 0;

  for (let j = 0; j < h; j++) {
    for (let y of [-1, 1]) {
      for (let i = 0; i < w; i++) {
        for (let x of [-1, 1]) {
          for (let c of [0, 1, 2]) {
            const x0y0 = data[getIdx(c, i + 0, j + 0)];
            const x1y0 = data[getIdx(c, i + x, j + 0)];
            const x0y1 = data[getIdx(c, i + 0, j + y)];
            const x1y1 = data[getIdx(c, i + x, j + y)];
            buffer[newIdx] = (9 * x0y0 + 3 * x1y0 + 3 * x0y1 + 1 * x1y1) / 16;
            newIdx++;
          }
        }
      }
    }
  }

  return result;
}

class IBLShader extends ShaderBase {
  constructor(gl) {
    super(gl, VS_SRC, FS_SRC_IBL);
  }

  setUniforms(camera) {}
}

class PanoShader extends ShaderBase {
  constructor(gl) {
    super(gl, VS_SRC, FS_SRC_PANO);
  }

  setUniforms(camera) {}
}

class iblSampler {
  constructor(gl) {
    this.gl = gl;

    this.textureSize = 256;
    this.ggxSampleCount = 1024;
    this.lambertianSampleCount = 2048;
    this.sheenSamplCount = 64;
    this.lodBias = 0.0;
    this.lowestMipLevel = 4;
    this.lutResolution = 1024;

    this.mipmapCount = undefined;

    this.lambertianTextureID = undefined;
    this.ggxTextureID = undefined;
    this.ggxTextureIDFiltered = undefined;

    this.sheenTextureID = undefined;

    this.ggxLutTextureID = undefined;
    this.charlieLutTextureID = undefined;

    this.inputTextureID = undefined;
    this.cubemapTextureID = undefined;
    this.framebuffer = undefined;

    this.iblShader = new IBLShader(gl);
    this.panoShader = new PanoShader(gl);
  }

  loadTextureHDR(image) {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    let internalFormat = this.gl.RGB32F;
    let format = this.gl.RGB;
    let type = this.gl.FLOAT;
    let data = undefined;

    if (image.dataFloat instanceof Float32Array && typeof this.gl.RGB32F !== "undefined") {
      while (image.height < 1023) image = magnify(image);

      internalFormat = this.gl.RGB32F;
      format = this.gl.RGB;
      type = this.gl.FLOAT;
      data = image.dataFloat;
    } else if (image.dataFloat instanceof Float32Array) {
      // workaround for node-gles not supporting RGB32F
      internalFormat = this.gl.RGBA32F;
      format = this.gl.RGBA;
      type = this.gl.FLOAT;

      const numPixels = image.dataFloat.length / 3;
      data = new Float32Array(numPixels * 4);
      for (let i = 0, src = 0, dst = 0; i < numPixels; ++i, src += 3, dst += 4) {
        // copy the pixels and pad the alpha channel
        data[dst] = image.dataFloat[src];
        data[dst + 1] = image.dataFloat[src + 1];
        data[dst + 2] = image.dataFloat[src + 2];
        data[dst + 3] = 0;
      }
    } else if (typeof Image !== "undefined" && image instanceof Image) {
      internalFormat = this.gl.RGBA;
      format = this.gl.RGBA;
      type = this.gl.UNSIGNED_BYTE;
      data = image;
    } else {
      console.error("loadTextureHDR failed, unsupported HDR image");
      return;
    }

    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, internalFormat, image.width, image.height, 0, format, type, data);

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.MIRRORED_REPEAT);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.MIRRORED_REPEAT);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    return texture;
  }

  internalFormat() {
    return this.use8bit ? this.gl.RGBA8 : this.gl.RGBA32F;
  }

  type() {
    return this.use8bit ? this.gl.UNSIGNED_BYTE : this.gl.FLOAT;
  }

  createCubemapTexture(withMipmaps) {
    const targetTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, targetTexture);

    for (let i = 0; i < 6; ++i) {
      this.gl.texImage2D(
        this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        0,
        this.internalFormat(),
        this.textureSize,
        this.textureSize,
        0,
        this.gl.RGBA,
        this.type(),
        null
      );
    }

    if (withMipmaps) {
      this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
    } else {
      this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    }

    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    return targetTexture;
  }

  updateFilteredCubemapTexture(targetTexture, mipmapLevel, floatPixels, textureSize) {
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, targetTexture);

    for (let i = 0; i < 6; ++i) {
      const data = floatRgbaToRgb(floatPixels[i]);
      this.gl.texImage2D(
        this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        mipmapLevel,
        this.gl.RGB9_E5,
        textureSize,
        textureSize,
        0,
        this.gl.RGB,
        this.gl.FLOAT,
        data
      );
    }
  }

  createLutTexture() {
    const targetTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, targetTexture);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.internalFormat(),
      this.lutResolution,
      this.lutResolution,
      0,
      this.gl.RGBA,
      this.type(),
      null
    );

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    return targetTexture;
  }

  init(panoramaImage) {
    if (!this.gl.getExtension("EXT_color_buffer_float") || !this.gl.getExtension("OES_texture_float_linear")) {
      console.warn("Floating point textures are not supported");
      this.use8bit = true;
    }

    this.inputTextureID = this.loadTextureHDR(panoramaImage);

    this.cubemapTextureID = this.createCubemapTexture(true);

    this.framebuffer = this.gl.createFramebuffer();

    this.lambertianTextureID = this.createCubemapTexture(false);
    this.ggxTextureID = this.createCubemapTexture(true);
    this.sheenTextureID = this.createCubemapTexture(true);

    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.ggxTextureID);
    this.gl.generateMipmap(this.gl.TEXTURE_CUBE_MAP);

    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.sheenTextureID);
    this.gl.generateMipmap(this.gl.TEXTURE_CUBE_MAP);

    this.mipmapLevels = Math.floor(Math.log2(this.textureSize)) + 1 - this.lowestMipLevel;
  }

  filterAll() {
    this.panoramaToCubeMap();
    this.cubeMapToLambertian();
    this.cubeMapToGGX();
    this.cubeMapToSheen();

    this.sampleGGXLut();
    this.sampleCharlieLut();

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
  }

  panoramaToCubeMap() {
    for (let i = 0; i < 6; ++i) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      this.gl.framebufferTexture2D(
        this.gl.FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0,
        this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        this.cubemapTextureID,
        0
      );

      this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);

      this.gl.viewport(0, 0, this.textureSize, this.textureSize);

      this.gl.clearColor(1.0, 0.0, 0.0, 0.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      const shader = this.panoShader;
      shader.bind();

      //  TEXTURE0 = active.
      this.gl.activeTexture(this.gl.TEXTURE0 + 0);

      // Bind texture ID to active texture
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.inputTextureID);

      // map shader uniform to texture unit (TEXTURE0)
      const location = shader.lookupUniformLocation("u_panorama");
      this.gl.uniform1i(location, 0); // texture unit 0 (TEXTURE0)

      shader.setUniform("u_currentFace", i);

      //fullscreen triangle
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }

    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);
    this.gl.generateMipmap(this.gl.TEXTURE_CUBE_MAP);
  }

  applyFilter(distribution, roughness, targetMipLevel, targetTexture, sampleCount, lodBias = 0.0, resultPixels = null) {
    const currentTextureSize = this.textureSize >> targetMipLevel;

    for (let i = 0; i < 6; ++i) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      this.gl.framebufferTexture2D(
        this.gl.FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0,
        this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        targetTexture,
        targetMipLevel
      );

      this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, targetTexture);

      this.gl.viewport(0, 0, currentTextureSize, currentTextureSize);

      this.gl.clearColor(1.0, 0.0, 0.0, 0.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      const shader = this.iblShader;
      shader.bind();

      //  TEXTURE0 = active.
      this.gl.activeTexture(this.gl.TEXTURE0);

      // Bind texture ID to active texture
      this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);

      // map shader uniform to texture unit (TEXTURE0)
      const location = shader.lookupUniformLocation("u_cubemapTexture");
      this.gl.uniform1i(location, 0); // texture unit 0

      shader.setUniform("u_roughness", roughness);
      shader.setUniform("u_sampleCount", sampleCount);
      shader.setUniform("u_width", this.textureSize);
      shader.setUniform("u_lodBias", lodBias);
      shader.setUniform("u_distribution", distribution);
      shader.setUniform("u_currentFace", i);
      shader.setUniform("u_isGeneratingLUT", 0);

      //fullscreen triangle
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

      if (resultPixels) {
        this.gl.readPixels(0, 0, currentTextureSize, currentTextureSize, this.gl.RGBA, this.gl.FLOAT, resultPixels[i]);
      }
    }
  }

  cubeMapToLambertian() {
    this.applyFilter(0, 0.0, 0, this.lambertianTextureID, this.lambertianSampleCount);
  }

  cubeMapToGGX() {
    this.ggxTextureIDFiltered = this.gl.createTexture();

    let resultPixels;

    for (let currentMipLevel = 0; currentMipLevel <= this.mipmapLevels; ++currentMipLevel) {
      const size = this.textureSize >> currentMipLevel;
      resultPixels = Array.from({ length: 6 }, () => new Float32Array(4 * size * size));

      const roughness = currentMipLevel / (this.mipmapLevels - 1);
      this.applyFilter(1, roughness, currentMipLevel, this.ggxTextureID, this.ggxSampleCount, 0.0, resultPixels);
      this.updateFilteredCubemapTexture(this.ggxTextureIDFiltered, currentMipLevel, resultPixels, size);
    }

    let currentMipLevel = this.mipmapLevels + 1;
    let size = this.textureSize >> currentMipLevel;

    while (size) {
      this.updateFilteredCubemapTexture(this.ggxTextureIDFiltered, currentMipLevel, resultPixels, size);
      currentMipLevel++;
      size = this.textureSize >> currentMipLevel;
    }

    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.ggxTextureIDFiltered);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  }

  cubeMapToSheen() {
    for (let currentMipLevel = 0; currentMipLevel <= this.mipmapLevels; ++currentMipLevel) {
      const roughness = currentMipLevel / (this.mipmapLevels - 1);
      this.applyFilter(2, roughness, currentMipLevel, this.sheenTextureID, this.sheenSamplCount);
    }
  }

  sampleLut(distribution, targetTexture, currentTextureSize) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, targetTexture, 0);

    this.gl.bindTexture(this.gl.TEXTURE_2D, targetTexture);

    this.gl.viewport(0, 0, currentTextureSize, currentTextureSize);

    this.gl.clearColor(1.0, 0.0, 0.0, 0.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    const shader = this.iblShader;
    shader.bind();

    //  TEXTURE0 = active.
    this.gl.activeTexture(this.gl.TEXTURE0 + 0);

    // Bind texture ID to active texture
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);

    // map shader uniform to texture unit (TEXTURE0)
    const location = shader.lookupUniformLocation("u_cubemapTexture");
    this.gl.uniform1i(location, 0); // texture unit 0

    shader.setUniform("u_roughness", 0.0);
    shader.setUniform("u_sampleCount", 512);
    shader.setUniform("u_width", 0.0);
    shader.setUniform("u_lodBias", 0.0);
    shader.setUniform("u_distribution", distribution);
    shader.setUniform("u_currentFace", 0);
    shader.setUniform("u_isGeneratingLUT", 1);

    //fullscreen triangle
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  sampleGGXLut() {
    this.ggxLutTextureID = this.createLutTexture();
    this.sampleLut(1, this.ggxLutTextureID, this.lutResolution);
  }

  sampleCharlieLut() {
    this.charlieLutTextureID = this.createLutTexture();
    this.sampleLut(2, this.charlieLutTextureID, this.lutResolution);
  }

  // destroy() {
  //   this.shaderCache.destroy();
  // }
}

export { iblSampler };
