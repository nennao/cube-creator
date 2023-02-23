import { ImageHDR, loadHDR } from "../../hdrpng";
import { iblSampler } from "../../ibl_sampler";

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

const getImage = (type: GLenum, image: WebGLTexture): TexImage => ({ type, image });

type Texture = {
  type: GLenum;
  sampler: number;
  source: number;
  glTexture?: WebGLTexture;
};

const getTexture = (sampler: number, source: number, type: GLenum): Texture => ({
  type,
  sampler,
  source,
});

class Resources {
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
  gltf: Resources,
  textureIdx: number,
  texSlot: number,
  name = ""
) {
  if (loc == -1) {
    console.warn("uniform location not found", name, textureIdx, texSlot);
    return false;
  }

  let gltfTex = gltf.textures[textureIdx];

  if (gltfTex == undefined) {
    console.warn("Texture is undefined: " + textureIdx);
    return false;
  }

  const image = gltf.images[gltfTex.source];
  if (image == undefined) {
    console.warn("Image is undefined for texture: " + gltfTex.source);
    return false;
  }

  if (gltfTex.glTexture == undefined) {
    gltfTex.glTexture = image.image;
  }

  // ===== bind =====
  gl.activeTexture(gl.TEXTURE0 + texSlot);
  gl.bindTexture(gltfTex.type, gltfTex.glTexture);
  gl.uniform1i(loc, texSlot);
  // ================

  return true;
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
  environment.images.push(getImage(gl.TEXTURE_CUBE_MAP, environmentFiltering.ggxTextureID));
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
