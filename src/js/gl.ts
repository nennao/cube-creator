function initGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const gl: WebGL2RenderingContext | null = canvas.getContext("webgl2", { alpha: false, antialias: true });

  if (gl == null) {
    alert("Unable to initialize WebGL2. Your browser or machine may not support it.");
    return null;
  }
  // gl.enable(gl.BLEND);
  // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.CULL_FACE);
  return gl;
}

export class CanvasHandler {
  private readonly gl: WebGL2RenderingContext | null = null;
  private readonly canvas: HTMLCanvasElement | null = null;

  constructor(canvasId: string) {
    const canvas: HTMLElement | null = document.getElementById(canvasId);
    if (canvas == null || !(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    this.canvas = canvas;
    this.gl = initGL(this.canvas);
    this.onWindowResize();
  }

  getGL(): WebGL2RenderingContext | null {
    return this.gl;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  onWindowResize() {
    if (this.canvas && this.gl) {
      const width = window.innerWidth;
      const height = window.innerHeight;

      const gl = this.gl;
      const canvas = this.canvas;

      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;

      canvas.style.width = "" + width + "px";
      canvas.style.height = "" + height + "px";

      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }
}
