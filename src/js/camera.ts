import { mat4, vec3 } from "gl-matrix";

import { clamp, mR, rad } from "./utils";

export class Camera {
  private readonly gl: WebGL2RenderingContext;
  private readonly up: vec3 = [0, 1, 0];
  private readonly target: vec3 = [0, 0, 0];

  private aspect = 1;
  private readonly fov = rad(45);
  private readonly zNear = 1;
  private readonly zFar = 50.0;

  readonly projectionMatrix = mat4.create();
  readonly viewMatrix = mat4.create();

  private readonly initialDistance = 15;
  private distance = 15;
  angleX = 0;
  angleY = 0;
  position: vec3 = [0.0, 0.0, this.distance];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.resize();
    this.handleWheelZoom();
  }

  resize() {
    this.aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
  }

  update() {
    this.position = [0.0, 0.0, this.distance];

    if (this.angleY) {
      vec3.rotateX(this.position, this.position, [0, 0, 0], rad(this.angleY));
    }
    if (this.angleX) {
      vec3.rotateY(this.position, this.position, [0, 0, 0], rad(this.angleX));
    }

    mat4.perspective(this.projectionMatrix, this.fov, this.aspect, this.zNear, this.zFar);
    mat4.lookAt(this.viewMatrix, this.position, this.target, this.up);
  }

  mouseRotate(dx: number, dy: number) {
    this.angleX += dx;
    this.angleX %= 360;

    this.angleY += dy;
    this.angleY = clamp(this.angleY, -90, 90);
  }

  resetAngle() {
    this.angleX = 0;
    this.angleY = 0;
  }

  resetDist() {
    this.distance = this.initialDistance;
  }

  get watcher() {
    const watching = [this.aspect, this.distance, this.angleX, this.angleY];
    return watching.join(",");
  }

  private clipXY(mouseX: number, mouseY: number): [number, number] {
    const w2 = this.gl.canvas.clientWidth / 2,
      h2 = this.gl.canvas.clientHeight / 2;
    return [(mouseX - w2) / w2, (h2 - mouseY) / h2]; // -1 to 1
  }

  getPickedVector(x: number, y: number) {
    const pf: vec3 = [...this.clipXY(x, y), 1];
    const PV = mat4.multiply(mat4.create(), this.projectionMatrix, this.viewMatrix);
    const invVP = mat4.invert(mat4.create(), PV);
    return vec3.transformMat4(vec3.create(), pf, invVP);
  }

  handleZoom(delta: number) {
    this.distance = mR(this.distance + delta, 3);
    if (this.distance > 30) this.distance = 30;
    if (this.distance < 8) this.distance = 8;
  }

  private handleWheelZoom() {
    this.gl.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.handleZoom(e.deltaY * 0.025);
    });
  }
}
