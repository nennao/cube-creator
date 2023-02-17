export type ImageHDR = {
  dataFloat: Float32Array;
  width: number;
  height: number;
};

export function loadHDR(buffer: Uint8Array): Promise<undefined | ImageHDR>;
