import { mat4, vec3 } from "gl-matrix";

import { Buffer, IndexBuffer } from "./buffer";
import { SimpleShader } from "./shader";
import { V3, vec3ToV3 } from "./utils";
import { PBRShader } from "../../lib/pbr/renderer/pbr_shader";

function calculateNormals(positions: V3[], indices: V3[], override: V3[] = []) {
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
  return normals.map((n, i) => override[i] || vec3ToV3(vec3.normalize(n, n))).flat();
}

export class Geometry {
  private readonly gl: WebGL2RenderingContext;
  private readonly positions: Buffer;
  private readonly colors: Buffer;
  private readonly normals: Buffer;
  private readonly indices: IndexBuffer;
  transform: mat4;

  constructor(gl: WebGL2RenderingContext, positions: V3[], colors: V3[], indices: V3[], normalsOverride?: V3[]) {
    this.gl = gl;

    const normals = calculateNormals(positions, indices, normalsOverride);
    this.positions = new Buffer(gl, positions.flat(), 3, gl.FLOAT);
    this.colors = new Buffer(gl, colors.flat(), 3, gl.FLOAT);
    this.normals = new Buffer(gl, normals, 3, gl.FLOAT);
    this.indices = new IndexBuffer(gl, indices.flat());

    this.transform = mat4.create();
  }

  update(positions: V3[], colors: V3[], indices: V3[], normalsOverride?: V3[]) {
    const normals = calculateNormals(positions, indices, normalsOverride);
    this.positions.write(positions.flat());
    this.colors.write(colors.flat());
    this.normals.write(normals.flat());
    this.indices.write(indices.flat());
  }

  draw(shader: SimpleShader | PBRShader) {
    shader.setUniform("u_ModelMatrix", this.transform);

    this.positions.bind(shader.vertexPosition);
    this.colors.bind(shader.vertexColor);
    this.normals.bind(shader.vertexNormal);
    this.indices.bind();
    this.gl.drawElements(this.gl.TRIANGLES, this.indices.indexCount, this.gl.UNSIGNED_SHORT, 0);
  }
}
