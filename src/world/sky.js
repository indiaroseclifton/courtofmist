// Night sky: moon, stars, a faint band of light, and haze toward the horizon.
import * as THREE from 'three';

export function buildSky(moonDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { moonDir: { value: moonDir.clone().normalize() }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 moonDir; uniform float time;
      varying vec3 vDir;
      float h(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float alt = clamp(d.y, -0.2, 1.0);
        vec3 zenith = vec3(0.006, 0.010, 0.026);
        vec3 horizon = vec3(0.0103, 0.0152, 0.0284);
        vec3 col = mix(horizon, zenith, pow(max(alt, 0.0), 0.45));
        // stars: hashed cells, twinkle, thinned near the hazy horizon
        vec3 sp = d * 420.0;
        vec3 cell = floor(sp);
        float s = h(cell);
        float star = step(0.9988, s) * smoothstep(0.05, 0.35, alt);
        float tw = 0.7 + 0.3 * sin(time * (1.0 + s * 5.0) + s * 40.0);
        col += star * tw * vec3(0.75, 0.8, 1.0) * (0.15 + 0.9 * pow(fract(s * 91.0), 3.0));
        // the faint river of stars
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.5, -0.8))) * 3.2, 2.0));
        col += band * vec3(0.012, 0.014, 0.022) * smoothstep(0.0, 0.3, alt);
        // moon: disk + soft halo through mist
        float m = dot(d, moonDir);
        float disk = smoothstep(0.99955, 0.99975, m);
        col += disk * vec3(2.6, 2.5, 2.25);
        col += pow(max(m, 0.0), 400.0) * vec3(0.20, 0.22, 0.26);
        col += pow(max(m, 0.0), 12.0) * vec3(0.025, 0.03, 0.04);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
