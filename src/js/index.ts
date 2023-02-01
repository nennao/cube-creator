import { CanvasHandler } from "./gl";

import { Camera } from "./camera";
import { Rubik } from "./rubik";

function main() {
  const canvasHandler = new CanvasHandler("glCanvas");
  const gl = canvasHandler.getGL();

  if (!gl) {
    console.error("no webgl2");
    return;
  }

  const camera = new Camera(gl);

  const resize = () => {
    canvasHandler.onWindowResize();
    camera.resize();
  };
  window.addEventListener("resize", resize);

  const rubik = new Rubik(gl, camera);

  const render = (now: number) => {
    rubik.render(now * 0.001);
    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
}

window.onload = main;
