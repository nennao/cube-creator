import { ImageHDR, loadHDR } from "../../hdrpng";
import { iblSampler } from "../../ibl_sampler";

// @ts-ignore
import normalUrl0 from "url:../../../assets/material/MetalSpotty.jpg";
// @ts-ignore
import normalUrl1 from "url:../../../assets/material/ScratchedNormal.png";
// @ts-ignore
import normalUrl2 from "url:../../../assets/material/metal_0026.png";

type Sampler = {
  magFilter: GLenum;
  minFilter: GLenum;
  wrapS: GLenum;
  wrapT: GLenum;
};

const getSampler = (magFilter: GLenum, minFilter: GLenum, wrapS: GLenum, wrapT: GLenum): Sampler => ({
  magFilter,
  minFilter,
  wrapS,
  wrapT,
});

type TexImage = {
  type: GLenum; // 2d or cube
  image: WebGLTexture;
};

function setSampler(gl: WebGL2RenderingContext, samplerObj: Sampler, type: GLenum) {
  gl.texParameteri(type, gl.TEXTURE_WRAP_S, samplerObj.wrapS);
  gl.texParameteri(type, gl.TEXTURE_WRAP_T, samplerObj.wrapT);
  gl.texParameteri(type, gl.TEXTURE_MIN_FILTER, samplerObj.minFilter);
  gl.texParameteri(type, gl.TEXTURE_MAG_FILTER, samplerObj.magFilter);
}

const getImage = (type: GLenum, image: WebGLTexture): TexImage => ({ type, image });

type Texture = {
  type: GLenum;
  sampler: number;
  source: number;
  glTexture?: WebGLTexture;
};

function loadHTMLImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
    image.crossOrigin = "";
  });
}

async function loadHTMLImages(images: string[]) {
  const imagePromises = [];
  for (let url of images) {
    imagePromises.push(loadHTMLImage(url));
  }
  return Promise.all(imagePromises);
}

const getTexture = (sampler: number, source: number, type: GLenum): Texture => ({
  type,
  sampler,
  source,
});

export class Resources {
  samplers: Sampler[] = [];
  images: TexImage[] = [];
  textures: Texture[] = [];
}

export class EnvResources extends Resources {
  readonly diffuseEnvMap = 0;
  readonly specularEnvMap = 1;
  readonly sheenEnvMap = 2;
  readonly lut = 3;
  readonly sheenLUT = 4;
  mipCount?: number;
}

export function setTexture(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  resources: Resources,
  textureIdx: number,
  texSlot: number,
  name = ""
) {
  if (loc == -1) {
    console.warn("uniform location not found", name, textureIdx, texSlot);
    return false;
  }

  let glTex = resources.textures[textureIdx];

  if (glTex == undefined) {
    console.warn("Texture is undefined: " + textureIdx);
    return false;
  }

  const image = resources.images[glTex.source];
  if (image == undefined) {
    console.warn("Image is undefined for texture: " + glTex.source);
    return false;
  }

  if (glTex.glTexture == undefined) {
    glTex.glTexture = image.image;
  }

  // ===== bind =====
  gl.activeTexture(gl.TEXTURE0 + texSlot);
  gl.bindTexture(glTex.type, glTex.glTexture);
  gl.uniform1i(loc, texSlot);
  // ================

  return true;
}

export async function loadMaterialResources(gl: WebGL2RenderingContext) {
  const resources = new Resources();

  const sampler = getSampler(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT, gl.REPEAT);
  resources.samplers.push(sampler);

  const type = gl.TEXTURE_2D;
  const images = await loadHTMLImages([normalUrl0, normalUrl1, normalUrl2]);

  images.forEach((image, i) => {
    const texture = gl.createTexture()!;

    gl.bindTexture(type, texture);
    setSampler(gl, sampler, type);

    gl.texImage2D(type, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(type);

    resources.images.push(getImage(type, texture));
    resources.textures.push(getTexture(0, i, type));
  });
  return resources;
}

export async function loadEnvironment(gl: WebGL2RenderingContext, hdrFileName: string) {
  const response = await fetch(hdrFileName);
  const data = await response.arrayBuffer();

  const image = await loadHDR(new Uint8Array(data));
  if (!image) {
    throw new Error("couldn't load HDR image");
  }
  return _loadEnvironmentFromPanorama(gl, image);
}

async function _loadEnvironmentFromPanorama(gl: WebGL2RenderingContext, imageHDR: ImageHDR) {
  const environment = new EnvResources();

  const environmentFiltering = new iblSampler(gl);

  environmentFiltering.init(imageHDR);
  environmentFiltering.filterAll();

  // Diffuse (diffuseEnvMap = 0)
  environment.samplers.push(getSampler(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE));
  environment.images.push(getImage(gl.TEXTURE_CUBE_MAP, environmentFiltering.lambertianTextureID));
  environment.textures.push(getTexture(0, 0, gl.TEXTURE_CUBE_MAP));

  // Specular (specularEnvMap = 1)
  environment.samplers.push(getSampler(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE));
  environment.images.push(getImage(gl.TEXTURE_CUBE_MAP, environmentFiltering.ggxTextureIDFiltered));
  environment.textures.push(getTexture(1, 1, gl.TEXTURE_CUBE_MAP));

  // Sheen (sheenEnvMap = 2)
  environment.samplers.push(getSampler(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE));
  environment.images.push(getImage(gl.TEXTURE_CUBE_MAP, environmentFiltering.sheenTextureID));
  environment.textures.push(getTexture(2, 2, gl.TEXTURE_CUBE_MAP));

  // GGX (lut = 3)
  environment.samplers.push(getSampler(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE));
  environment.images.push(getImage(gl.TEXTURE_2D, environmentFiltering.ggxLutTextureID));
  environment.textures.push(getTexture(3, 3, gl.TEXTURE_2D));

  // Sheen (sampler index = 3, sheenLUT = 4)
  environment.images.push(getImage(gl.TEXTURE_2D, environmentFiltering.charlieLutTextureID));
  environment.textures.push(getTexture(3, 4, gl.TEXTURE_2D));

  environment.mipCount = environmentFiltering.mipmapLevels;

  return environment;
}
