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
  opacity: number;
}

/**
 * Decorative Three.js background for the auth pages: a slowly rotating
 * particle network in the brand accent.
 * - three.js is loaded via dynamic import, so it only ships with this route
 * - colors follow the active theme
 * - honors prefers-reduced-motion (renders a single static frame)
 * - pauses while the tab is hidden
 */
@Component({
  selector: 'app-auth-fx',
  template: `<canvas
    #canvas
    class="pointer-events-none absolute inset-0 h-full w-full"
    aria-hidden="true"
  ></canvas>`,
})
export class AuthFxComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);

  private disposed = false;
  private rafId = 0;
  private renderer?: import('three').WebGLRenderer;
  private renderOnce?: () => void;
  private applyColors?: (colors: FxColors) => void;
  private resizeObserver?: ResizeObserver;
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

    const { group, animate, setColors } = buildNet(THREE, palette(this.theme.effective() === 'dark'));
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
      animate(time / 1000);
      renderer.render(scene, camera);
      this.rafId = requestAnimationFrame(this.tick);
    };

    if (prefersReducedMotion()) {
      animate(1.5); // a pleasant static pose
      renderer.render(scene, camera);
    } else {
      this.rafId = requestAnimationFrame(this.tick);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
  }
}

function palette(dark: boolean): FxColors {
  return dark
    ? { primary: 0x818cf8, secondary: 0x6366f1, opacity: 0.55 } // indigo-400/500
    : { primary: 0x4f46e5, secondary: 0x6366f1, opacity: 0.35 }; // indigo-600/500
}

type Three = typeof import('three');

interface FxScene {
  group: import('three').Group;
  animate: (t: number) => void;
  setColors: (colors: FxColors) => void;
}

/** Slowly rotating particle network with a static topology. */
function buildNet(THREE: Three, colors: FxColors): FxScene {
  const group = new THREE.Group();
  const count = 130;
  const radius = 6.5;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // random point in a flattened sphere so the net hugs the viewport
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * Math.cbrt(Math.random()));
    positions[i * 3] = v.x * 1.4;
    positions[i * 3 + 1] = v.y * 0.9;
    positions[i * 3 + 2] = v.z * 0.6;
  }
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pointsMat = new THREE.PointsMaterial({
    color: colors.primary,
    size: 0.09,
    transparent: true,
    opacity: colors.opacity,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(pointsGeo, pointsMat));

  // connect close pairs once (static topology, rotates as a whole)
  const linePositions: number[] = [];
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < 4.4) {
        linePositions.push(
          positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
          positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2],
        );
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: colors.secondary,
    transparent: true,
    opacity: colors.opacity * 0.3,
  });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  return {
    group,
    animate: (t) => {
      group.rotation.y = t * 0.05;
      group.rotation.x = Math.sin(t * 0.11) * 0.12;
    },
    setColors: (c) => {
      pointsMat.color.set(c.primary);
      pointsMat.opacity = c.opacity;
      lineMat.color.set(c.secondary);
      lineMat.opacity = c.opacity * 0.3;
    },
  };
}
