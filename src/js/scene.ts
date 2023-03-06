import { Camera } from "./camera";
import { SimpleShader } from "./shader";
import { Rubik } from "./rubik";
import { EnvironmentRenderer } from "../../lib/pbr/renderer/environment_renderer";
import { handleButtonById, handleFpsDisplay, handleInputById, targetListener } from "./utils";
import { PBRShader } from "../../lib/pbr/renderer/pbr_shader";

export class Scene {
  private clock = 0;
  private readonly gl: WebGL2RenderingContext;
  readonly camera: Camera;
  readonly cubeShader: SimpleShader;
  readonly environment: EnvironmentRenderer;
  readonly pbrShader: PBRShader;
  activeShader: SimpleShader | PBRShader;
  private readonly changeWatcher: { val: any; get: () => any }[];

  private readonly pointerEvents: { activeId: number; cache: PointerEvent[]; prevDiff: number } = {
    activeId: -1,
    cache: [],
    prevDiff: -1,
  };
  private mouse0 = { x: 0, y: 0 };
  private mouse = { x: 0, y: 0 };

  private readonly cube: Rubik;

  environmentLoaded = false;
  moveCamera = false;

  get ready() {
    return this.environmentLoaded;
  }

  constructor(gl: WebGL2RenderingContext, camera: Camera) {
    this.gl = gl;
    this.initGL();

    this.camera = camera;
    this.cubeShader = new SimpleShader(gl);
    this.environment = new EnvironmentRenderer(gl, this);
    this.pbrShader = new PBRShader(gl);
    // this.activeShader = this.cubeShader;
    this.activeShader = this.pbrShader;

    this.changeWatcher = this.initChangeWatcher();
    this.initDOMInputs();
    this.handleInputEvents();

    this.cube = new Rubik(gl, this);
  }

  initGL() {
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.cullFace(this.gl.BACK);

    this.gl.clearColor(0.5, 0.5, 0.5, 1.0);
    this.gl.clearDepth(1);
  }

  resetCam() {
    if (this.moveCamera) {
      this.camera.reset();
    } else {
      this.cube.resetCam();
    }
  }

  private initDOMInputs() {
    const moveCamCheck = (t: HTMLInputElement) => {
      this.moveCamera = t.checked;
      this.triggerRedraw();
    };
    handleInputById("moveCamera", this.moveCamera, "onclick", targetListener(moveCamCheck));
    handleButtonById("resetCam", "onclick", () => this.resetCam());
  }

  private handleInputEvents() {
    const canvas = this.gl.canvas;

    const mousemoveRotateHandler = (e: PointerEvent) => {
      if (this.pointerEvents.activeId != e.pointerId) {
        return;
      }
      if (this.pointerEvents.cache.length == 1) {
        const cap = (n: number) => Math.min(n, 2);
        const [dx, dy] = [cap(e.clientX - this.mouse.x), cap(e.clientY - this.mouse.y)];
        if (this.moveCamera) {
          this.camera.mouseRotate(dx, dy);
        } else {
          this.cube.mouseRotate(dx, dy);
        }
      }
      this.mouse = { x: e.clientX, y: e.clientY };
    };

    const mouseupRotateHandler = (e: PointerEvent) => {
      if (this.pointerEvents.activeId != e.pointerId) {
        return;
      }
      window.removeEventListener("pointermove", mousemoveRotateHandler);
      window.removeEventListener("pointerup", mouseupRotateHandler);
      window.removeEventListener("pointercancel", mouseupRotateHandler);
    };

    const mousemoveBlockHandler = (e: PointerEvent) => {
      if (this.pointerEvents.activeId != e.pointerId) {
        return;
      }
      const { clientX: x, clientY: y } = e;
      const { x: x0, y: y0 } = this.mouse0;
      this.mouse = { x, y };
      this.cube.handleMousemoveBlock(x, y, x0, y0);
    };

    const mouseupBlockHandler = (e: PointerEvent) => {
      if (this.pointerEvents.activeId != e.pointerId) {
        return;
      }
      this.cube.cleanupMousemoveBlock();
      window.removeEventListener("pointermove", mousemoveBlockHandler);
      window.removeEventListener("pointerup", mouseupBlockHandler);
      window.removeEventListener("pointercancel", mouseupBlockHandler);
    };

    const mousemoveZoomHandler = this.mousemoveZoomHandler.bind(this);

    const mouseupZoomHandler = () => {
      window.removeEventListener("pointermove", mousemoveZoomHandler);
      window.removeEventListener("pointerup", mouseupZoomHandler);
      window.removeEventListener("pointercancel", mouseupZoomHandler);
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.buttons != 1) {
        return;
      }
      this.pointerEvents.cache.push(e);

      if (this.pointerEvents.cache.length == 2 && !this.cube.manualBlockMoving) {
        window.addEventListener("pointermove", mousemoveZoomHandler);
        window.addEventListener("pointerup", mouseupZoomHandler);
        window.addEventListener("pointercancel", mouseupZoomHandler);
      } else if (this.pointerEvents.cache.length == 1) {
        this.pointerEvents.activeId = e.pointerId;
        if (e.buttons == 1) {
          this.mouse0 = { x: e.clientX, y: e.clientY };
          this.mouse = { x: e.clientX, y: e.clientY };
          const blockClicked = this.cube.findClickedBlock(e.clientX, e.clientY);

          if (blockClicked) {
            if (!this.cube.rotating) {
              window.addEventListener("pointermove", mousemoveBlockHandler);
              window.addEventListener("pointerup", mouseupBlockHandler);
              window.addEventListener("pointercancel", mouseupBlockHandler);
            }
          } else {
            window.addEventListener("pointermove", mousemoveRotateHandler);
            window.addEventListener("pointerup", mouseupRotateHandler);
            window.addEventListener("pointercancel", mouseupRotateHandler);
          }
        }
      }
    });

    const pointerCleanup = (e: PointerEvent) => {
      for (let i = 0; i < this.pointerEvents.cache.length; i++) {
        if (this.pointerEvents.cache[i].pointerId == e.pointerId) {
          this.pointerEvents.cache.splice(i, 1);
          break;
        }
      }
      if (this.pointerEvents.cache.length < 2) {
        this.pointerEvents.prevDiff = -1;
      }
    };

    window.addEventListener("pointerup", pointerCleanup);
    window.addEventListener("pointercancel", pointerCleanup);
  }

  mousemoveZoomHandler(e: PointerEvent) {
    const { cache, prevDiff } = this.pointerEvents;

    // update the event
    for (let i = 0; i < cache.length; i++) {
      if (e.pointerId == cache[i].pointerId) {
        cache[i] = e;
        break;
      }
    }

    if (cache.length == 2) {
      let currDiff = Math.hypot(cache[0].clientX - cache[1].clientX, cache[0].clientY - cache[1].clientY);

      if (prevDiff > 0) {
        this.camera.handleZoom((prevDiff - currDiff) * 0.1);
      }
      this.pointerEvents.prevDiff = currDiff;
    }
  }

  private initChangeWatcher() {
    const getters = [
      () => 0, // for dom ui
      () => this.camera.watcher,
    ];

    return getters.map((getter, i) => ({ val: i ? getter() : 1, get: getter }));
  }

  triggerRedraw() {
    this.changeWatcher[0].val = 1;
  }

  private changeWatch() {
    for (let watcher of this.changeWatcher) {
      if (watcher.val != watcher.get()) {
        watcher.val = watcher.get();
        return true;
      }
    }
    return false;
  }

  renderAll() {
    // this.environment.drawEnvironmentMap();
    this.cube.draw();
  }

  render(t: number) {
    const dt = t - this.clock;
    this.clock = t;

    if (!this.ready) {
      return;
    }

    this.cube.update(dt);

    const play = this.changeWatch();

    handleFpsDisplay(dt, play);

    if (play) {
      this.camera.update();

      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      this.renderAll();
    }
  }
}
