'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BRAND } from '@zemi/shared';
import { pointer } from '@/lib/hooks/use-pointer';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

export interface ShaderBackdropProps {
  className?: string;
  style?: CSSProperties;
  /** Up to four hex colors. Default: the brand blue, red, yellow, green. */
  colors?: string[];
  /** Blob strength 0..1. Default 0.5 (soft tints on white). */
  intensity?: number;
  /** Animation speed multiplier. Default 1. */
  speed?: number;
  /** Film grain amount. Default 0.05. */
  grain?: number;
  /** Blobs lean toward the pointer. Default true. */
  follow?: boolean;
  /** Internal render scale (blobs are soft, so low is fine). Default 0.5. */
  resolution?: number;
  /** Base color under the blobs. Default white. */
  base?: string;
}

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `precision mediump float;
uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;uniform vec3 uColors[4];uniform float uIntensity;uniform float uGrain;uniform vec3 uBase;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  // Work in units of the short side so blobs keep their size on tall and wide boxes.
  vec2 R=uRes/min(uRes.x,uRes.y);
  vec2 p=uv*R;
  vec2 m=uMouse*R;
  vec3 col=uBase;
  for(int i=0;i<4;i++){
    float f=float(i);
    vec2 c=R*.5+vec2(cos(uTime*.13*(1.+f*.31)+f*1.7)*.4*R.x,sin(uTime*.11*(1.+f*.27)+f*2.3)*.36*R.y);
    c+=(m-c)*(.14-f*.02);
    float r=.62+.1*sin(uTime*.23+f*1.3);
    float a=1.-smoothstep(0.,r,length(p-c));
    a*=a;
    col=mix(col,uColors[i],a*uIntensity);
  }
  col+=(hash(gl_FragCoord.xy+fract(uTime*.37)*91.)-.5)*uGrain;
  gl_FragColor=vec4(col,1.);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Soft, slowly drifting brand-color blobs with a little grain, on white. Pointer reactive.
 * Plain WebGL (no three.js), paused offscreen, one still frame under reduced motion,
 * CSS gradients when WebGL is unavailable. Put it behind a section: it fills its box.
 *
 * @example <section className="relative"><ShaderBackdrop className="absolute inset-0 -z-10" />...</section>
 */
export function ShaderBackdrop({
  className,
  style,
  colors = [BRAND.colors.blue, BRAND.colors.red, BRAND.colors.yellow, BRAND.colors.green],
  intensity = 0.5,
  speed = 1,
  grain = 0.05,
  follow = true,
  resolution = 0.5,
  base = '#ffffff',
}: ShaderBackdropProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const colorKey = colors.join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = (canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' }) ??
      null) as WebGLRenderingContext | null;
    if (!gl) {
      setFailed(true);
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) {
      console.warn('[zemi backdrop] shader failed, using the CSS fallback.', e);
      setFailed(true);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes');
    const uTime = u('uTime');
    const uMouse = u('uMouse');
    const cols = Array.from({ length: 4 }, (_, i) => hexToRgb(colors[i % colors.length] ?? '#ffffff')).flat();
    gl.uniform3fv(u('uColors'), new Float32Array(cols));
    gl.uniform1f(u('uIntensity'), intensity);
    gl.uniform1f(u('uGrain'), grain);
    gl.uniform3fv(u('uBase'), new Float32Array(hexToRgb(base)));

    const reduced = prefersReducedMotion();
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let raf = 0;
    let visible = true;
    let t = 12;
    let last = performance.now();

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * resolution));
      const h = Math.max(1, Math.round(canvas.clientHeight * resolution));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    const draw = () => {
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * speed;
      if (follow) {
        const p = pointer.get();
        if (p.active) {
          const r = canvas.getBoundingClientRect();
          mouse.tx = Math.min(1.2, Math.max(-0.2, (p.x - r.left) / (r.width || 1)));
          mouse.ty = Math.min(1.2, Math.max(-0.2, 1 - (p.y - r.top) / (r.height || 1)));
        }
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
      }
      draw();
      loop();
    };
    const loop = () => {
      if (!raf && visible && !reduced && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    };

    resize();
    draw();
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      last = performance.now();
      loop();
    });
    io.observe(canvas);
    const onVis = () => {
      last = performance.now();
      loop();
    };
    document.addEventListener('visibilitychange', onVis);
    loop();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      // No loseContext() here: StrictMode re-runs this effect on the same canvas, and a lost
      // context can't be revived. The context is released with the canvas element.
    };
    // colors compared by value via colorKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey, intensity, speed, grain, follow, resolution, base]);

  if (failed) {
    const [a, b, c, d] = colors;
    return (
      <div
        aria-hidden="true"
        className={cn('pointer-events-none', className ?? 'absolute inset-0')}
        style={{
          background: `radial-gradient(40% 50% at 18% 30%, ${a}33, transparent 70%), radial-gradient(38% 46% at 82% 24%, ${b}2b, transparent 70%), radial-gradient(42% 50% at 70% 80%, ${c}38, transparent 70%), radial-gradient(40% 48% at 24% 82%, ${d}2b, transparent 70%), ${base}`,
          ...style,
        }}
      />
    );
  }

  return <canvas ref={ref} aria-hidden="true" className={cn('pointer-events-none block', className ?? 'absolute inset-0 size-full')} style={style} />;
}
