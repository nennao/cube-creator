import { mat4, vec3 } from "gl-matrix";

import { Buffer, IndexBuffer } from "./buffer";
import { SimpleShader } from "./shader";
import { V3, vec3ToV3 } from "./utils";

function calculateNormals(positionsFlat: number[], indicesFlat: number[]) {
  const unflatten = (arr: number[]) =>
    Array.from({ length: arr.length / 3 }, (_, i): V3 => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]]);

  const positions = unflatten(positionsFlat);
  const indices = unflatten(indicesFlat);

  const normals = Array.from({ length: positions.length }, () => vec3.create());

  for (let [i0, i1, i2] of indices) {
    const p0 = positions[i0];
    const p1 = positions[i1];
    const p2 = positions[i2];

    const e1 = vec3.subtract(vec3.create(), p0, p1);
    const e2 = vec3.subtract(vec3.create(), p2, p1);

    const normal = vec3.cross(vec3.create(), e2, e1);

    for (let idx of [i0, i1, i2]) {
      vec3.add(normals[idx], normals[idx], normal);
    }
  }
  return normals.map((n) => vec3ToV3(vec3.normalize(n, n))).flat();
}

export class Geometry {
  private readonly gl: WebGL2RenderingContext;
  private readonly positions: Buffer;
  private readonly colors: Buffer;
  private readonly normals: Buffer;
  private readonly indices: IndexBuffer;
  transform: mat4;

  constructor(gl: WebGL2RenderingContext, positions: number[], colors: number[], indices: number[]) {
    this.gl = gl;

    const normals = calculateNormals(positions, indices);
    this.positions = new Buffer(gl, positions, 3, gl.FLOAT);
    this.colors = new Buffer(gl, colors, 3, gl.FLOAT);
    this.normals = new Buffer(gl, normals, 3, gl.FLOAT);
    this.indices = new IndexBuffer(gl, indices);

    this.transform = mat4.create();
  }

  draw(shader: SimpleShader) {
    shader.setUniformMatrix4fv("u_ModelMatrix", this.transform);

    this.positions.bind(shader.vertexPosition);
    this.colors.bind(shader.vertexColor);
    this.normals.bind(shader.vertexNormal);
    this.indices.bind();
    this.gl.drawElements(this.gl.TRIANGLES, this.indices.indexCount, this.gl.UNSIGNED_SHORT, 0);
  }
}
