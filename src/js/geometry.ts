import { mat4 } from "gl-matrix";

import { Buffer, IndexBuffer } from "./buffer";
import { SimpleShader } from "./shader";

export class Geometry {
  private readonly gl: WebGL2RenderingContext;
  private readonly positions: Buffer;
  private readonly colors: Buffer;
  private readonly indices: IndexBuffer;
  readonly transform: mat4;

  constructor(gl: WebGL2RenderingContext, positions: number[], colors: number[], indices: number[]) {
    this.gl = gl;

    this.positions = new Buffer(gl, positions, 3, gl.FLOAT);
    this.colors = new Buffer(gl, colors, 3, gl.FLOAT);
    this.indices = new IndexBuffer(gl, indices);

    this.transform = mat4.create();
  }

  draw(shader: SimpleShader) {
    shader.setUniformMatrix4fv("u_ModelMatrix", this.transform);

    this.positions.bind(shader.vertexPosition);
    this.colors.bind(shader.vertexColor);
    this.indices.bind();
    this.gl.drawElements(this.gl.TRIANGLES, this.indices.indexCount, this.gl.UNSIGNED_SHORT, 0);
  }
}
