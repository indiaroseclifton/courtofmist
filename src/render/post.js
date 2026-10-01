// The lens and the film: restrained bloom, shallow depth of field, ACES filmic tone mapping,
// grain, a soft vignette, a touch of lateral chroma, and motion blur only across cuts.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.045 },
    vignette: { value: 0.32 },
    chroma: { value: 0.0014 },
    cut: { value: 0 },
    cutDir: { value: new THREE.Vector2(1, 0) },
    aspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, chroma, cut, aspect; uniform vec2 cutDir;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
      vec3 col;
      if (cut > 0.001) {
        // a camera cut: smear along the move for a few frames, as a shutter would
        col = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float t = float(i) / 11.0 - 0.5;
          col += texture2D(tDiffuse, vUv + cutDir * t * cut * 0.06).rgb;
        }
        col /= 12.0;
      } else {
        vec2 off = c * chroma * (1.0 + r2 * 4.0);
        col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      }
      col *= 1.0 - vignette * smoothstep(0.15, 0.95, r2);
      // grain: luminance-weighted, strongest in the mids, as on stock
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float n = rand(vUv * 1000.0 + fract(time * 13.7)) + rand(vUv * 731.0 - fract(time * 7.3)) - 1.0;
      col += n * grain * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function buildPost(renderer, scene, camera, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.55, 0.92);
  composer.addPass(bloom);
  const bokeh = new BokehPass(scene, camera, { focus: 3.5, aperture: 0.0016, maxblur: 0.008 });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  film.uniforms.aspect.value = w / h;
  composer.addPass(film);

  const state = { cut: 0 };
  return {
    composer,
    bokeh,
    film,
    setFocus(d, aperture = 0.0016) {
      const u = bokeh.uniforms;
      u.focus.value += (d - u.focus.value) * 0.25;
      u.aperture.value = aperture;
    },
    // call when the camera cuts; dir is the screen-space direction of the jump
    cutTo(dir = new THREE.Vector2(1, 0)) { state.cut = 1; film.uniforms.cutDir.value.copy(dir).normalize(); },
    render(dt, t) {
      state.cut = Math.max(0, state.cut - dt / 0.18);
      film.uniforms.cut.value = state.cut;
      film.uniforms.time.value = t;
      composer.render(dt);
    },
    setSize(w2, h2) { composer.setSize(w2, h2); film.uniforms.aspect.value = w2 / h2; },
  };
}
