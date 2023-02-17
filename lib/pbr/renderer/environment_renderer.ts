import { mat4, mat3 } from "gl-matrix";
import { Buffer, IndexBuffer } from "../../../src/js/buffer";
import { Camera } from "../../../src/js/camera";
import { Scene } from "../../../src/js/scene";
import { CubemapShader } from "../../../src/js/shader";
import { rad } from "../../../src/js/utils";
import { loadEnvironment, EnvResources, setTexture } from "./resource_handler";

// @ts-ignore
import hdrFile from "url:../../../assets/environments/Colorful_Studio.hdr";

class EnvironmentRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly scene: Scene;
  private readonly camera: Camera;
  private readonly shader: CubemapShader;

  private readonly positions: Buffer;
  private readonly indices: IndexBuffer;

  private resources?: EnvResources;

  constructor(gl: WebGL2RenderingContext, scene: Scene) {
    this.gl = gl;
    this.scene = scene;
    this.camera = scene.camera;
    this.shader = new CubemapShader(gl);

    loadEnvironment(gl, hdrFile).then((envResources) => {
      this.resources = envResources;
      this.scene.initGL();
      this.scene.environmentLoaded = true;
    });

    // prettier-ignore
    this.indices = new IndexBuffer(gl,[
      1, 2, 0,    2, 3, 0,
      6, 2, 1,    1, 5, 6,
      6, 5, 4,    4, 7, 6,
      6, 3, 2,    7, 3, 6,
      3, 7, 0,    7, 4, 0,
      5, 1, 0,    4, 5, 0,
    ]);

    // prettier-ignore
    this.positions = new Buffer(gl, [
      -1, -1, -1,
       1, -1, -1,
       1,  1, -1,
      -1,  1, -1,
      -1, -1,  1,
       1, -1,  1,
       1,  1,  1,
      -1,  1,  1,
    ], 3, gl.FLOAT);
  }

  drawEnvironmentMap() {
    const { gl, shader, resources } = this;

    if (!resources) {
      return;
    }
    this.shader.bind(this.camera);

    setTexture(gl, shader.lookupUniformLocation("u_GGXEnvSampler") ?? -1, resources, resources.specularEnvMap, 0);

    shader.setUniform("u_MipCount", resources.mipCount);
    shader.setUniform("u_EnvBlurNormalized", 0.0);
    // shader.setUniform("u_Exposure", 1.0);

    let rotMatrix4 = mat4.create();
    mat4.rotateY(rotMatrix4, rotMatrix4, rad(0));
    let rotMatrix3 = mat3.create();
    mat3.fromMat4(rotMatrix3, rotMatrix4);
    shader.setUniform("u_EnvRotation", rotMatrix3);

    gl.disable(gl.DEPTH_TEST);

    this.positions.bind(shader.vertexPosition);
    this.indices.bind();

    gl.drawElements(gl.TRIANGLES, this.indices.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.DEPTH_TEST);
  }
}

export { EnvironmentRenderer };
