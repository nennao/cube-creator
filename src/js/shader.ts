import { mat4 } from "gl-matrix";

import { Camera } from "./camera";

// @ts-ignore
import VS_SRC from "../../shaders/vs_source.glsl";
// @ts-ignore
import FS_SRC from "../../shaders/fs_source.glsl";

class ShaderBase {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram | null = null;
  private readonly uniformLocations: { [key: string]: WebGLUniformLocation } = {};
  private readonly attribLocations: { [key: string]: GLint } = {};

  protected constructor(gl: WebGL2RenderingContext, vsSource: string, fsSource: string) {
    this.gl = gl;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fsSource);

    if (vertexShader && fragmentShader) {
      this.program = this.createProgram(vertexShader, fragmentShader);
      this.storeUniformAndAttribLocations();
    }
  }

  private createShader(type: GLenum, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!(type == gl.VERTEX_SHADER || type == gl.FRAGMENT_SHADER)) {
      console.error(`${type} not acceptable for gl.createShader`);
      return null;
    }

    const shader = this.gl.createShader(type);
    if (shader == null) {
      alert("An error occurred creating the shaders");
      return null;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    const gl = this.gl;
    const shaderProgram = gl.createProgram();

    if (shaderProgram == null) {
      alert("An error occurred creating the program");
      return null;
    }

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      alert("Unable to initialize the shader program: " + gl.getProgramInfoLog(shaderProgram));
      return null;
    }
    return shaderProgram;
  }

  private storeUniformAndAttribLocations() {
    if (!this.program) {
      return;
    }
    for (let i = 0; i < this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS); i++) {
      const name = this.gl.getActiveUniform(this.program, i)!.name;
      this.uniformLocations[name] = this.gl.getUniformLocation(this.program, name)!;
    }
    for (let i = 0; i < this.gl.getProgramParameter(this.program, this.gl.ACTIVE_ATTRIBUTES); i++) {
      const name = this.gl.getActiveAttrib(this.program, i)!.name;
      this.attribLocations[name] = this.gl.getAttribLocation(this.program, name);
    }
  }

  lookupAttribLocation(name: string): GLint | null {
    const loc = this.attribLocations[name];
    if (loc != undefined) {
      return loc;
    }
    return null;
  }

  lookupAttribLocationStrict(name: string): GLint {
    const attribLocation = this.lookupAttribLocation(name);
    if (attribLocation == null) {
      throw new Error(`"${name}" attribute not found in shader attribLocations`);
    }
    if (attribLocation < 0) {
      throw new Error(`"${name}" not found in shader program`);
    }
    return attribLocation;
  }

  bind(camera: Camera) {
    this.gl.useProgram(this.program);

    for (let name of Object.keys(this.attribLocations)) {
      const loc = this.attribLocations[name];
      if (loc > -1) {
        this.gl.enableVertexAttribArray(loc);
      }
    }

    this.setUniforms(camera);
  }

  setUniforms(camera: Camera) {
    console.warn("calling setUniforms on base shader class");
    this.setUniformMatrix4fv("u_ProjectionMatrix", camera.projectionMatrix);
    this.setUniformMatrix4fv("u_ViewMatrix", camera.viewMatrix);
  }

  setUniform1f(name: string, val: number) {
    this.gl.uniform1f(this.uniformLocations[name], val);
  }

  setUniformMatrix4fv(name: string, val: mat4) {
    this.gl.uniformMatrix4fv(this.uniformLocations[name], false, val);
  }
}

export class SimpleShader extends ShaderBase {
  readonly vertexPosition: GLint;
  readonly vertexColor: GLint;

  constructor(gl: WebGL2RenderingContext) {
    super(gl, VS_SRC, FS_SRC);
    this.vertexPosition = this.lookupAttribLocationStrict("a_VertexPosition");
    this.vertexColor = this.lookupAttribLocationStrict("a_VertexColor");
  }

  setUniforms(camera: Camera) {
    this.setUniformMatrix4fv("u_ProjectionMatrix", camera.projectionMatrix);
    this.setUniformMatrix4fv("u_ViewMatrix", camera.viewMatrix);
  }
}
