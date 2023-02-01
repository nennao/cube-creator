export class Buffer {
  private readonly gl: WebGL2RenderingContext;
  private readonly numComponents: number;
  private readonly componentType: GLenum;
  private readonly buffer: WebGLBuffer | null;

  constructor(gl: WebGL2RenderingContext, data: number[], numComponents: number, componentType: GLenum) {
    this.gl = gl;
    this.numComponents = numComponents;
    this.componentType = componentType;
    this.buffer = gl.createBuffer();
    this.write(data);
  }

  write(data: number[]) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
  }

  bind(attrLocation: GLuint) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.vertexAttribPointer(attrLocation, this.numComponents, this.componentType, false, 0, 0);
  }
}

export class IndexBuffer {
  private readonly gl: WebGL2RenderingContext;
  private readonly buffer: WebGLBuffer | null;
  indexCount = 0;

  constructor(gl: WebGL2RenderingContext, data: number[]) {
    this.gl = gl;
    this.buffer = gl.createBuffer();
    this.write(data);
  }

  write(data: number[]) {
    this.indexCount = data.length;
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), this.gl.STATIC_DRAW);
  }

  bind() {
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffer);
  }
}
