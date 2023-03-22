import { ImageHDR } from "../hdrpng";

export declare class iblSampler {
  constructor(gl: WebGL2RenderingContext);

  init(imageHDR: ImageHDR): void;

  filterAll(): void;

  lambertianTextureID: WebGLTexture;
  ggxTextureID: WebGLTexture;
  sheenTextureID: WebGLTexture;
  ggxLutTextureID: WebGLTexture;
  ggxTextureIDFiltered: WebGLTexture;
  charlieLutTextureID: WebGLTexture;
  mipmapLevels: number;
}
