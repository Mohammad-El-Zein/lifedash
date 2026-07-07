import {
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../../core/theme/theme.service';
import { prefersReducedMotion } from '../../shared/animations';

interface FxColors {
  primary: number;
  secondary: number;
  tertiary: number;
  opacity: number;
}

/**
 * Hero Three.js element for the public landing page — a bolder sibling of the
 * auth pages' AuthFxComponent (same loading/lifecycle rules: lazy three.js
 * import, theme-aware colors, reduced-motion static frame, pauses when the
 * tab is hidden). Adds gentle pointer parallax.
 */
@Component({
  selector: 'app-landing-fx',
  template: `<canvas
    #canvas
    class="pointer-events-none absolute inset-0 h-full w-full"
    aria-hidden="true"
  ></canvas>`,
})
export class LandingFxComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);

  private disposed = false;
  private rafId = 0;
  private renderer?: import('three').WebGLRenderer;
  private renderOnce?: () => void;
  private applyColors?: (colors: FxColors) => void;
  private resizeObserver?: ResizeObserver;
  private pointer = { x: 0, y: 0 };
  private readonly onPointer = (event: PointerEvent) => {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  private readonly onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
    } else if (!prefersReducedMotion()) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
  private tick: FrameRequestCallback = () => {};

  constructor() {
    effect(() => {
      const dark = this.theme.effective() === 'dark';
      this.applyColors?.(palette(dark));
      this.renderOnce?.();
    });
    void this.init();
  }

  private async init(): Promise<void> {
    const THREE = await import('three');
    if (this.disposed) return;

    const canvas = this.canvasRef().nativeElement;
    const host = canvas.parentElement as HTMLElement;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 10;

    const { group, animate, setColors } = buildWaves(
      THREE,
      palette(this.theme.effective() === 'dark'),
    );
    scene.add(group);
    this.applyColors = setColors;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(host);
    resize();

    this.renderOnce = () => renderer.render(scene, camera);
    this.tick = (time) => {
      animate(time / 1000, this.pointer);
      renderer.render(scene, camera);
      this.rafId = requestAnimationFrame(this.tick);
    };

    if (prefersReducedMotion()) {
      animate(1.5, { x: 0, y: 0 });
      renderer.render(scene, camera);
    } else {
      this.rafId = requestAnimationFrame(this.tick);
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pointermove', this.onPointer, { passive: true });
    }
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointer);
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
  }
}

function palette(dark: boolean): FxColors {
  return dark
    ? { primary: 0x818cf8, secondary: 0xa78bfa, tertiary: 0x6366f1, opacity: 0.75 }
    : { primary: 0x4f46e5, secondary: 0x7c3aed, tertiary: 0x6366f1, opacity: 0.45 };
}

type Three = typeof import('three');
type Pointer = { x: number; y: number };

interface FxScene {
  group: import('three').Group;
  animate: (t: number, pointer: Pointer) => void;
  setColors: (colors: FxColors) => void;
}

/** Flowing aurora wave field of points below the hero copy (user-picked
 * from three prototyped variants: net XL / orbit / waves). */
function buildWaves(THREE: Three, colors: FxColors): FxScene {
  const group = new THREE.Group();
  const cols = 110;
  const rows = 42;
  const width = 26;
  const depth = 12;
  const count = cols * rows;
  const positions = new Float32Array(count * 3);
  const colorAttr = new Float32Array(count * 3);
  const primary = new THREE.Color(colors.primary);
  const secondary = new THREE.Color(colors.secondary);
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const i = iz * cols + ix;
      positions[i * 3] = (ix / (cols - 1) - 0.5) * width;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (iz / (rows - 1) - 0.5) * depth;
      const mixed = primary.clone().lerp(secondary, ix / (cols - 1));
      colorAttr[i * 3] = mixed.r;
      colorAttr[i * 3 + 1] = mixed.g;
      colorAttr[i * 3 + 2] = mixed.b;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.085,
    transparent: true,
    opacity: colors.opacity,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.Points(geo, mat));
  group.position.y = -2.6;
  group.rotation.x = -0.42;

  const attr = geo.getAttribute('position') as import('three').BufferAttribute;
  return {
    group,
    animate: (t, pointer) => {
      for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix < cols; ix++) {
          const i = iz * cols + ix;
          const x = positions[i * 3];
          const z = positions[i * 3 + 2];
          attr.setY(
            i,
            Math.sin(x * 0.45 + t * 0.9) * 0.55 +
              Math.cos(z * 0.7 + t * 0.6) * 0.45 +
              Math.sin((x + z) * 0.25 + t * 0.4) * 0.3,
          );
        }
      }
      attr.needsUpdate = true;
      group.rotation.z = pointer.x * 0.03;
    },
    setColors: (c) => {
      const p = new THREE.Color(c.primary);
      const s = new THREE.Color(c.secondary);
      const colorBuf = geo.getAttribute('color') as import('three').BufferAttribute;
      for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix < cols; ix++) {
          const i = iz * cols + ix;
          const mixed = p.clone().lerp(s, ix / (cols - 1));
          colorBuf.setXYZ(i, mixed.r, mixed.g, mixed.b);
        }
      }
      colorBuf.needsUpdate = true;
      mat.opacity = c.opacity;
    },
  };
}
