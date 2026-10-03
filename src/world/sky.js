// One parametric sky for every region: night with moon and stars, Spring's flat overcast,
// Windhaven's late sun, Dawn's sunrise, Day's noon. Clouds are periodic fbm drifting overhead.
import * as THREE from 'three';

export const SKIES = {
  night: { zenith: [0.006, 0.010, 0.026], horizon: [0.0103, 0.0152, 0.0284], sun: [2.6, 2.5, 2.25], disk: 0.99965, glow: 0.2, stars: 1, clouds: 0.15, cloudColor: [0.02, 0.025, 0.04], moon: 1 },
  overcast: { zenith: [0.32, 0.35, 0.38], horizon: [0.46, 0.48, 0.5], sun: [0.6, 0.6, 0.6], disk: 1.1, glow: 0.05, stars: 0, clouds: 0.95, cloudColor: [0.38, 0.4, 0.42], moon: 0 },
  snowday: { zenith: [0.36, 0.42, 0.5], horizon: [0.62, 0.64, 0.68], sun: [2.0, 1.9, 1.7], disk: 0.9995, glow: 0.25, stars: 0, clouds: 0.75, cloudColor: [0.55, 0.57, 0.6], moon: 0 },
  afternoon: { zenith: [0.12, 0.24, 0.48], horizon: [0.62, 0.58, 0.5], sun: [9, 7.2, 5], disk: 0.99975, glow: 0.6, stars: 0, clouds: 0.45, cloudColor: [0.75, 0.68, 0.6], moon: 0 },
  golden: { zenith: [0.1, 0.16, 0.32], horizon: [0.95, 0.55, 0.25], sun: [12, 7, 3], disk: 0.99975, glow: 1.0, stars: 0, clouds: 0.35, cloudColor: [0.9, 0.5, 0.3], moon: 0 },
  sunrise: { zenith: [0.12, 0.17, 0.35], horizon: [1.0, 0.55, 0.42], sun: [14, 8, 5], disk: 0.99975, glow: 1.2, stars: 0.1, clouds: 0.4, cloudColor: [0.95, 0.55, 0.5], moon: 0 },
  noon: { zenith: [0.08, 0.2, 0.5], horizon: [0.55, 0.65, 0.78], sun: [20, 19, 17], disk: 0.9998, glow: 0.3, stars: 0, clouds: 0.25, cloudColor: [0.95, 0.95, 0.95], moon: 0 },
  none: { zenith: [0, 0, 0], horizon: [0, 0, 0], sun: [0, 0, 0], disk: 2, glow: 0, stars: 0, clouds: 0, cloudColor: [0, 0, 0], moon: 0 },
};

export function buildSky(sunDir) {
  const v3 = (a) => new THREE.Vector3(...a);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
      time: { value: 0 },
      zenith: { value: v3(SKIES.night.zenith) },
      horizon: { value: v3(SKIES.night.horizon) },
      sunColor: { value: v3(SKIES.night.sun) },
      disk: { value: SKIES.night.disk },
      glow: { value: SKIES.night.glow },
      stars: { value: 1 },
      clouds: { value: 0.15 },
      cloudColor: { value: v3(SKIES.night.cloudColor) },
      moon: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, zenith, horizon, sunColor, cloudColor;
      uniform float time, disk, glow, stars, clouds, moon;
      varying vec3 vDir;
      float h(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n2(p); p*=2.03; a*=.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float alt = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(horizon, zenith, pow(max(alt, 0.0), 0.45));
        // below the horizon: the same haze, darkened, so fogged geometry blends into it
        col = mix(col, horizon * 0.6, smoothstep(0.0, -0.15, d.y));
        float m = dot(d, sunDir);
        // sun or moon disk and its halo through the air
        col += smoothstep(disk, disk + 0.0002, m) * sunColor;
        col += pow(max(m, 0.0), 400.0) * sunColor * 0.08 * (0.3 + glow);
        col += pow(max(m, 0.0), 8.0) * sunColor * 0.02 * glow;
        col += pow(max(m, 0.0), 3.0) * horizon * 0.25 * glow * (1.0 - alt);
        // stars
        vec3 cell = floor(d * 420.0);
        float s = h(cell);
        float star = step(0.9988, s) * smoothstep(0.05, 0.35, alt) * stars;
        col += star * (0.7 + 0.3 * sin(time * (1.0 + s * 5.0) + s * 40.0)) * vec3(0.75, 0.8, 1.0) * (0.15 + 0.9 * pow(fract(s * 91.0), 3.0));
        col += exp(-pow(dot(d, normalize(vec3(0.3, 0.5, -0.8))) * 3.2, 2.0)) * vec3(0.012, 0.014, 0.022) * smoothstep(0.0, 0.3, alt) * stars;
        // clouds on a dome: projected plane, drifting
        if (clouds > 0.0 && d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float c = fbm(uv * 1.2);
          float cover = smoothstep(1.0 - clouds, 1.0 - clouds + 0.35, c);
          float lit = 0.6 + 0.4 * fbm(uv * 1.2 + sunDir.xz * 0.15);
          vec3 cc = cloudColor * lit + sunColor * 0.03 * glow * pow(max(m, 0.0), 6.0);
          col = mix(col, cc, cover * smoothstep(0.0, 0.12, d.y));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.setPreset = (name, dir) => {
    const p = SKIES[name] ?? SKIES.night;
    const u = mat.uniforms;
    u.zenith.value.set(...p.zenith); u.horizon.value.set(...p.horizon); u.sunColor.value.set(...p.sun);
    u.cloudColor.value.set(...p.cloudColor);
    u.disk.value = p.disk; u.glow.value = p.glow; u.stars.value = p.stars; u.clouds.value = p.clouds; u.moon.value = p.moon;
    if (dir) u.sunDir.value.copy(dir).normalize();
    sky.visible = name !== 'none';
  };
  return sky;
}
