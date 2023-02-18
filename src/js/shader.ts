import { Camera } from "./camera";

// @ts-ignore
import VS_SRC from "../../shaders/vs_source.glsl";
// @ts-ignore
import FS_SRC from "../../shaders/fs_source.glsl";

export class ShaderBase {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram | null = null;
  private readonly uniformLocations: { [key: string]: { type: GLenum; loc: WebGLUniformLocation } } = {};
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
      const info = this.gl.getActiveUniform(this.program, i);
      if (info) {
        this.uniformLocations[info.name] = {
          type: info.type,
          loc: this.gl.getUniformLocation(this.program, info.name)!,
        };
      }
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

  lookupUniformLocation(name: string): WebGLUniformLocation | null {
    const loc = this.uniformLocations[name];
    if (loc) {
      return loc.loc;
    }
    return null;
  }

  bind(camera?: Camera) {
    this.gl.useProgram(this.program);

    for (let name of Object.keys(this.attribLocations)) {
      const loc = this.attribLocations[name];
      if (loc > -1) {
        this.gl.enableVertexAttribArray(loc);
      }
    }

    this.setUniforms(camera);
  }

  setUniforms(camera?: Camera) {
    console.warn("calling setUniforms on base shader class");
  }

  setUniform(name: string, value: any) {
    const gl = this.gl;
    const uniform = this.uniformLocations[name];

    if (uniform) {
      switch (uniform.type) {
        case gl.FLOAT:
          gl.uniform1f(uniform.loc, value);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(uniform.loc, value);
          break;
        case gl.INT:
          gl.uniform1i(uniform.loc, value);
          break;
        case gl.FLOAT_MAT3:
          gl.uniformMatrix3fv(uniform.loc, false, value);
          break;
        case gl.FLOAT_MAT4:
          gl.uniformMatrix4fv(uniform.loc, false, value);
          break;
        default:
          console.warn("couldn't set uniform:", name, uniform);
      }
    } else {
      console.warn("Unknown uniform: " + name);
    }
  }
}

export class SimpleShader extends ShaderBase {
  readonly vertexPosition: GLint;
  readonly vertexColor: GLint;
  readonly vertexNormal: GLint;

  constructor(gl: WebGL2RenderingContext) {
    super(gl, VS_SRC, FS_SRC);
    this.vertexPosition = this.lookupAttribLocationStrict("a_VertexPosition");
    this.vertexColor = this.lookupAttribLocationStrict("a_VertexColor");
    this.vertexNormal = this.lookupAttribLocationStrict("a_VertexNormal");
  }

  setUniforms(camera: Camera) {
    this.setUniform("u_ProjectionMatrix", camera.projectionMatrix);
    this.setUniform("u_ViewMatrix", camera.viewMatrix);
    this.setUniform("u_ViewPosition", camera.position);
  }
}

// @ts-ignore
import VS_SRC_CUBEMAP from "../../lib/pbr/renderer/shaders/cubemap.vert";
// @ts-ignore
import FS_SRC_CUBEMAP from "../../lib/pbr/renderer/shaders/cubemap.frag";

export class CubemapShader extends ShaderBase {
  readonly vertexPosition: GLint;

  constructor(gl: WebGL2RenderingContext) {
    super(gl, VS_SRC_CUBEMAP, FS_SRC_CUBEMAP);
    this.vertexPosition = this.lookupAttribLocationStrict("a_position");
  }

  setUniforms(camera: Camera) {
    this.setUniform("u_ProjectionMatrix", camera.projectionMatrix);
    this.setUniform("u_ViewMatrix", camera.viewMatrix);
  }
}
