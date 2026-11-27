// ============================================================================
// Krunked Cards — Complete WebGL2 GLSL ES 3.00 Shader Library (Visual Juice++)
// Faithfully builds on all 19 shader pipelines with luxury collectible-card
// shine, dazzling holographic diffraction, liquid chrome foil, prismatic gloss,
// material-specific enhancement sheens, and colossal multi-band roaring flames:
//   - Pass 1A: Title Splash Vortex (splash.fs)
//   - Pass 1B: Gameplay Felt Swirl (background.fs + flame-reactive heat surge)
//   - Pass 2:  Card & Sprite Suite (Base + 3D Gloss, Foil, Holo, Polychrome,
//              Negative, Negative Shine, Hologram, Booster, Voucher, Played,
//              Dissolve, Debuff, Gold Seal, Wax Seal Gleam, Glass Crystal,
//              Brushed Steel, Molten Gold, Cosmic/Mystic Sheen, Edition Aura)
//   - Pass 3:  Multi-Band Roaring Scoreboard Flames (flame.fs supercharged)
//   - Pass 3B: Crisp Pixel-Square / Diamond / Glass Shard / 4-Point Sparkle
//              Star / Rising Flame Wisp Instanced Particle Renderer
//   - Pass 3C: Impact / Entry Radial Flash (flash.fs)
//   - Pass 4:  Screen Vortex Warp (vortex.fs) + Specular Bloom + Tuned CRT
// ============================================================================

export const SHADER_MODE = {
  BASE: 0,
  FOIL: 1,
  HOLO: 2,
  POLYCHROME: 3,
  NEGATIVE: 4,
  DISSOLVE: 5,
  DEBUFF: 6,
  GOLD_SEAL: 7,
  NEGATIVE_SHINE: 8,
  HOLOGRAM: 9,
  BOOSTER: 10,
  VOUCHER: 11,
  PLAYED: 12,
  CARD_GLOSS: 13,
  GLASS_SHIMMER: 14,
  STEEL_METALLIC: 15,
  GOLD_FOIL: 16,
  COSMIC_SHEEN: 17,
  EDITION_AURA: 18,
} as const;

export type ShaderMode = (typeof SHADER_MODE)[keyof typeof SHADER_MODE];

// ---------------------------------------------------------------------------
// Shared Full-Screen Triangle Vertex Shader
// ---------------------------------------------------------------------------

export const BACKGROUND_VERT = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
out vec2 v_uv;
void main() {
  vec2 p = POS[gl_VertexID];
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 1A: Title Splash Vortex (splash.fs)
// ---------------------------------------------------------------------------

export const SPLASH_VERT = BACKGROUND_VERT;

export const SPLASH_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_vortSpeed;
uniform vec4 u_colour1;
uniform vec4 u_colour2;
uniform float u_midFlash;
uniform float u_vortOffset;

#define PIXEL_SIZE_FAC 700.0
#define SPLASH_BLACK (0.6 * vec4(79.0 / 255.0, 99.0 / 255.0, 103.0 / 255.0, 1.0 / 0.6))

void main() {
  vec2 screen_coords = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  float resLen = length(u_resolution);
  float pixel_size = resLen / PIXEL_SIZE_FAC;
  vec2 uv = (floor(screen_coords * (1.0 / pixel_size)) * pixel_size - 0.5 * u_resolution) / resLen;
  float uv_len = length(uv);

  // Center swirl accelerating into steady vortex
  float speed = u_time * u_vortSpeed;
  float new_pixel_angle =
    atan(uv.y, uv.x) +
    (2.2 + 0.4 * min(6.0, speed)) * uv_len -
    1.0 -
    speed * 0.05 -
    min(6.0, speed) * speed * 0.02 +
    u_vortOffset;

  vec2 mid = (u_resolution / resLen) * 0.5;
  vec2 sv = vec2(uv_len * cos(new_pixel_angle) + mid.x, uv_len * sin(new_pixel_angle) + mid.y) - mid;

  // 5-iteration vortex smoke field
  sv *= 30.0;
  speed = u_time * 6.0 * u_vortSpeed + u_vortOffset + 1033.0;
  vec2 uv2 = vec2(sv.x + sv.y);

  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(sv.x, sv.y)) + sv;
    sv += 0.5 * vec2(
      cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
      sin(uv2.x - 0.113 * speed)
    );
    sv -= cos(sv.x + sv.y) - sin(sv.x * 0.711 - sv.y);
  }

  float smoke_res = min(2.0, max(-2.0, 1.5 + length(sv) * 0.12 - 0.17 * min(10.0, u_time * 1.2 - 4.0)));
  if (smoke_res < 0.2) {
    smoke_res = (smoke_res - 0.2) * 0.6 + 0.2;
  }

  float c1p = max(0.0, 1.0 - 2.0 * abs(1.0 - smoke_res));
  float c2p = max(0.0, 1.0 - 2.0 * smoke_res);
  float cb = 1.0 - min(1.0, c1p + c2p);

  vec4 ret_col = u_colour1 * c1p + u_colour2 * c2p + vec4(cb * SPLASH_BLACK.rgb, cb * u_colour1.a);
  // Subtle radiant prism core halo behind the title Ace
  float centerGlow = smoothstep(0.32, 0.0, uv_len) * (0.20 + 0.06 * sin(u_time * 2.2));
  ret_col.rgb += mix(vec3(0.18, 0.72, 1.0), vec3(1.0, 0.45, 0.38), 0.5 + 0.5 * sin(u_time * 0.8 + uv_len * 8.0)) * centerGlow;

  float mod_flash = max(u_midFlash * 0.8, max(c1p, c2p) * 5.0 - 4.4) + u_midFlash * max(c1p, c2p);
  mod_flash = clamp(mod_flash, 0.0, 1.0);

  vec3 finalRgb = ret_col.rgb * (1.0 - mod_flash) + vec3(mod_flash);
  fragColor = vec4(clamp(finalRgb, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 1B: Gameplay Background Swirl (background.fs + subtle flame heat lift)
// ---------------------------------------------------------------------------

export const BACKGROUND_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_spinTime;
uniform vec4 u_colour1;
uniform vec4 u_colour2;
uniform vec4 u_colour3;
uniform float u_contrast;
uniform float u_spinAmount;
uniform float u_flameHeat; // 0..1 ambient table glow when flames roar

#define PIXEL_SIZE_FAC 700.0
#define SPIN_EASE 0.5

void main() {
  vec2 screen_coords = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  float resLen = length(u_resolution);
  float pixel_size = resLen / PIXEL_SIZE_FAC;
  vec2 uv = (floor(screen_coords * (1.0 / pixel_size)) * pixel_size - 0.5 * u_resolution) / resLen - vec2(0.12, 0.0);
  float uv_len = length(uv);

  float speed = (u_spinTime * SPIN_EASE * 0.2) + 302.2;
  float new_pixel_angle = atan(uv.y, uv.x) + speed - SPIN_EASE * 20.0 * (u_spinAmount * uv_len + (1.0 - u_spinAmount));
  vec2 mid = (u_resolution / resLen) * 0.5;
  uv = vec2(uv_len * cos(new_pixel_angle) + mid.x, uv_len * sin(new_pixel_angle) + mid.y) - mid;

  uv *= 30.0;
  speed = u_time * (2.0 + u_flameHeat * 1.4);
  vec2 uv2 = vec2(uv.x + uv.y);

  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * vec2(
      cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
      sin(uv2.x - 0.113 * speed)
    );
    uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
  }

  float contrast_mod = 0.25 * u_contrast + 0.5 * u_spinAmount + 1.2;
  float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
  float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  float c3p = 1.0 - min(1.0, c1p + c2p);

  float baseMix = 0.3 / max(0.1, u_contrast);
  vec4 ret_col = baseMix * u_colour1 + (1.0 - baseMix) * (
    u_colour1 * c1p +
    u_colour2 * c2p +
    vec4(c3p * u_colour3.rgb, c3p * u_colour1.a)
  );

  // Subtle ambient heat glow radiating from the blazing scoreboard when flames roar
  if (u_flameHeat > 0.01) {
    float leftHeat = smoothstep(0.62, 0.0, v_uv.x) * (0.45 + 0.55 * smoothstep(0.0, 0.65, 1.0 - abs(v_uv.y - 0.52) * 2.0));
    vec3 heatTint = mix(vec3(0.08, 0.42, 0.92), vec3(1.0, 0.36, 0.12), smoothstep(0.10, 0.40, v_uv.x + 0.06 * sin(u_time * 3.0 + v_uv.y * 8.0)));
    ret_col.rgb += heatTint * leftHeat * u_flameHeat * 0.22 * (0.65 + 0.35 * c1p);
  }

  fragColor = vec4(clamp(ret_col.rgb, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 2: Card & Sprite Shader (All 19 Card/Item Modes + skew.fs Perspective)
// ---------------------------------------------------------------------------

export const SPRITE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner; // 0..1 quad corner

uniform vec2 u_resolution;
uniform vec2 u_center;      // pixel center (top-left origin)
uniform vec2 u_size;        // pixel width, height
uniform float u_rotation;   // radians
uniform vec4 u_uvRect;      // (u0, v0, uSize, vSize) in atlas 0..1
uniform vec2 u_tilt;        // pseudo-3D hover tilt (-1..1)
uniform float u_hovering;   // 0..1.5 hover depth factor
uniform vec2 u_mousePos;    // mouse screen pos (top-left origin)
uniform vec2 u_shakeOffset; // micro-shake offset in CSS px

out vec2 v_texCoord;
out vec2 v_localUv;

void main() {
  vec2 local = a_corner - vec2(0.5);
  vec2 scaled = local * u_size;

  float c = cos(u_rotation);
  float s = sin(u_rotation);
  vec2 rotated = vec2(
    scaled.x * c - scaled.y * s,
    scaled.x * s + scaled.y * c
  );

  vec2 posPx = u_center + rotated + u_shakeOffset;
  float tiltDepth = (local.x * u_tilt.x + local.y * u_tilt.y) * 0.20;

  // Convert pixel coordinates (top-left origin) to NDC (-1..1, bottom-left origin)
  vec2 ndc = vec2(
    (posPx.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (posPx.y / u_resolution.y) * 2.0
  );

  // Faithful skew.fs hover perspective warp
  float perspW = 1.0 + tiltDepth;
  if (u_hovering > 0.001) {
    float resLen = length(u_resolution);
    float mid_dist = length(posPx - 0.5 * u_resolution) / max(1.0, resLen);
    float screen_scale = max(1.0, min(u_resolution.x, u_resolution.y) * 0.28);
    vec2 mouse_offset = (posPx - u_mousePos) / screen_scale;
    float hoverScale = 0.095 * (-0.03 - 0.3 * max(0.0, 0.3 - mid_dist))
                     * u_hovering * dot(mouse_offset, mouse_offset) / (2.0 - mid_dist);
    perspW += clamp(hoverScale, -0.13, 0.13);
  }

  gl_Position = vec4(ndc, 0.0, max(0.55, perspW));
  v_localUv = a_corner;
  v_texCoord = u_uvRect.xy + a_corner * u_uvRect.zw;
}
`;

export const SPRITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_localUv;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform int u_shaderMode;
uniform float u_time;
uniform vec2 u_effectVec;   // edition / shader animation phase (rotation/tilt + time seed)
uniform float u_dissolve;   // 0..1
uniform bool u_shadow;
uniform vec4 u_tint;
uniform vec2 u_cellPixels;  // e.g. (71.0, 95.0)
uniform vec4 u_uvRect;      // (u0, v0, uSize, vSize) for safe intra-cell sampling
uniform vec4 u_burnColour1;
uniform vec4 u_burnColour2;
uniform float u_triggerGlow; // 0..1 radiant hit-flash during scoring triggers

float hue(float s, float t, float h) {
  float hs = mod(h, 1.0) * 6.0;
  if (hs < 1.0) return (t - s) * hs + s;
  if (hs < 3.0) return t;
  if (hs < 4.0) return (t - s) * (4.0 - hs) + s;
  return s;
}

vec4 RGB(vec4 c) {
  if (c.y < 0.0001) return vec4(vec3(c.z), c.a);
  float t = (c.z < 0.5) ? c.y * c.z + c.z : -c.y * c.z + (c.y + c.z);
  float s = 2.0 * c.z - t;
  return vec4(hue(s, t, c.x + 1.0 / 3.0), hue(s, t, c.x), hue(s, t, c.x - 1.0 / 3.0), c.w);
}

vec4 HSL(vec4 c) {
  float low = min(c.r, min(c.g, c.b));
  float high = max(c.r, max(c.g, c.b));
  float delta = high - low;
  float sum = high + low;

  vec4 hsl = vec4(0.0, 0.0, 0.5 * sum, c.a);
  if (delta == 0.0) return hsl;

  hsl.y = (hsl.z < 0.5) ? delta / max(0.0001, sum) : delta / max(0.0001, 2.0 - sum);
  if (high == c.r) hsl.x = (c.g - c.b) / delta;
  else if (high == c.g) hsl.x = (c.b - c.r) / delta + 2.0;
  else hsl.x = (c.r - c.g) / delta + 4.0;

  hsl.x = mod(hsl.x / 6.0, 1.0);
  return hsl;
}

// Crisp pixel-quantized 4-point sparkle stars dancing across foil/holo ridges
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float pixelSparkle(vec2 uv, vec2 grid, float phase, float density) {
  vec2 cell = floor(uv * grid);
  vec2 f = fract(uv * grid) - 0.5;
  float rnd = hash21(cell);
  if (rnd < density) return 0.0;
  float pulse = max(0.0, sin(phase * (2.6 + rnd * 3.8) + rnd * 31.4159));
  pulse = pow(pulse, 5.0);
  if (pulse < 0.05) return 0.0;
  // Crisp 4-point cross star inside the pixel grid cell
  float ax = abs(f.x);
  float ay = abs(f.y);
  float crossStar = max(
    step(ax, 0.11) * step(ay, 0.42),
    step(ay, 0.11) * step(ax, 0.42)
  );
  float core = step(ax + ay, 0.24);
  return clamp(crossStar * 0.72 + core * 0.55, 0.0, 1.0) * pulse;
}

// Diagonal glossy specular reflection band (responds to tilt/rotation/time!)
float glossySweep(vec2 uv, float phase, float width, float tiltSlope) {
  float diag = uv.x * 0.85 + uv.y * tiltSlope;
  float bandPos = mod(phase, 2.6) - 0.65;
  float d = abs(diag - bandPos);
  float primary = smoothstep(width, 0.0, d);
  float companion = smoothstep(width * 0.48, 0.0, abs(diag - (bandPos + width * 1.15))) * 0.65;
  return clamp(primary + companion, 0.0, 1.0);
}

vec4 dissolve_mask(vec4 tex, vec2 uv) {
  if (u_dissolve < 0.001) {
    return vec4(u_shadow ? vec3(0.0) : tex.rgb, u_shadow ? tex.a * 0.34 : tex.a);
  }
  float adjusted_dissolve = (u_dissolve * u_dissolve * (3.0 - 2.0 * u_dissolve)) * 1.02 - 0.01;
  float t = u_time * 10.0 + 2003.0;
  float maxDim = max(u_cellPixels.x, u_cellPixels.y);
  vec2 floored_uv = floor(uv * u_cellPixels) / maxDim;
  vec2 uv_scaled_centered = (floored_uv - 0.5) * 2.3 * maxDim;

  vec2 fp1 = uv_scaled_centered + 50.0 * vec2(sin(-t / 143.6340), cos(-t / 99.4324));
  vec2 fp2 = uv_scaled_centered + 50.0 * vec2(cos( t / 53.1532),  cos( t / 61.4532));
  vec2 fp3 = uv_scaled_centered + 50.0 * vec2(sin(-t / 87.53218), sin(-t / 49.0000));

  float field = (1.0 + (
    cos(length(fp1) / 19.483) +
    sin(length(fp2) / 33.155) * cos(fp2.y / 15.73) +
    cos(length(fp3) / 27.193) * sin(fp3.x / 21.92)
  )) * 0.5;

  vec2 borders = vec2(0.2, 0.8);
  float res = (0.5 + 0.5 * cos(adjusted_dissolve / 82.612 + (field - 0.5) * 3.14159))
    - (floored_uv.x > borders.y ? (floored_uv.x - borders.y) * (5.0 + 5.0 * u_dissolve) : 0.0) * u_dissolve
    - (floored_uv.y > borders.y ? (floored_uv.y - borders.y) * (5.0 + 5.0 * u_dissolve) : 0.0) * u_dissolve
    - (floored_uv.x < borders.x ? (borders.x - floored_uv.x) * (5.0 + 5.0 * u_dissolve) : 0.0) * u_dissolve
    - (floored_uv.y < borders.x ? (borders.x - floored_uv.y) * (5.0 + 5.0 * u_dissolve) : 0.0) * u_dissolve;

  if (tex.a > 0.01 && u_burnColour1.a > 0.01 && !u_shadow &&
      res < adjusted_dissolve + 0.8 * (0.5 - abs(adjusted_dissolve - 0.5)) &&
      res > adjusted_dissolve) {
    if (res < adjusted_dissolve + 0.5 * (0.5 - abs(adjusted_dissolve - 0.5))) {
      tex = u_burnColour1;
    } else if (u_burnColour2.a > 0.01) {
      tex = u_burnColour2;
    }
  }

  float outAlpha = res > adjusted_dissolve ? (u_shadow ? tex.a * 0.34 : tex.a) : 0.0;
  return vec4(u_shadow ? vec3(0.0) : tex.rgb, outAlpha);
}

void main() {
  vec2 uv = v_localUv;

  // Mode 9: Hologram (hologram.fs supercharged — glowing cyan-emerald glitch projection)
  if (u_shaderMode == 9 && !u_shadow) {
    if (uv.x > 0.96 || uv.x < 0.04 || uv.y > 0.96 || uv.y < 0.04) discard;

    vec2 cellMin = u_uvRect.xy;
    vec2 cellMax = u_uvRect.xy + u_uvRect.zw;
    vec2 glowStep = (vec2(1.55) / max(vec2(1.0), u_cellPixels)) * u_uvRect.zw;

    float glow = 0.0;
    float totalSamples = 0.0;
    for (int i = -4; i <= 4; ++i) {
      for (int j = -4; j <= 4; ++j) {
        vec2 sampleUv = clamp(v_texCoord + glowStep * vec2(float(i), float(j)), cellMin, cellMax);
        float sa = texture(u_tex, sampleUv).a;
        glow += min(0.92, sa);
        totalSamples += 1.0;
      }
    }
    glow /= max(1.0, 0.58 * totalSamples);

    float timefac = u_effectVec.y;
    float gy = uv.y;
    float offset_l = -10.0 * (
      -0.5 +
      sin(timefac * 0.512 + gy * 14.0) +
      sin(-timefac * 0.8233 + gy * 11.532) +
      sin(timefac * 0.333 + gy * 13.3) +
      sin(-timefac * 0.1112331 + gy * 4.044343)
    );
    float offset_r = -10.0 * (
      -0.5 +
      sin(timefac * 0.6924 + gy * 19.0) +
      sin(-timefac * 0.9661 + gy * 21.532) +
      sin(timefac * 0.4423 + gy * 30.3) +
      sin(-timefac * 0.13321312 + gy * 3.011)
    );
    if (offset_r >= 1.5 || offset_r <= 0.0) offset_r = 0.0;
    if (offset_l >= 1.5 || offset_l <= 0.0) offset_l = 0.0;

    float glitchShift = 0.022 * (-offset_l + offset_r) * u_uvRect.z;
    vec2 glitchedTc = vec2(clamp(v_texCoord.x + glitchShift, cellMin.x, cellMax.x), v_texCoord.y);
    vec4 htex = texture(u_tex, glitchedTc);

    float light_strength = 0.48 * (0.3 * sin(2.0 * u_effectVec.y) + 0.65 + 0.3 * sin(u_effectVec.x * 3.0) + 0.95);
    float glitchBoost = 1.0 + abs(offset_l) + abs(offset_r);
    float scanline = 0.80 + 0.20 * sin(uv.y * u_cellPixels.y * 3.14159 + u_time * 10.0);
    float scanBar = smoothstep(0.10, 0.0, abs(fract(uv.y - u_time * 0.45) - 0.5)) * 0.35;

    vec4 final_col;
    if (htex.a < 0.01) {
      final_col = vec4(0.05, 1.0, 0.72, 0.78) * light_strength * glitchBoost * glow;
    } else {
      vec3 holoTint = mix(htex.rgb, vec3(0.24, 1.0, 0.96), 0.44) * scanline + vec3(0.25, 1.0, 0.92) * scanBar;
      float baseA = min(0.88, htex.a);
      final_col = vec4(holoTint, baseA) * u_tint +
                  vec4(0.05, 0.48, 0.42, 0.42) * light_strength * glitchBoost * glow;
    }

    final_col.rgb += vec3(0.45, 1.0, 0.98) * u_triggerGlow * 0.45;
    final_col = clamp(final_col, 0.0, 1.0);
    vec4 outHolo = dissolve_mask(final_col, uv);
    if (outHolo.a < 0.01) discard;
    fragColor = outHolo;
    return;
  }

  vec4 tex = texture(u_tex, v_texCoord);
  if (tex.a < 0.01) discard;

  if (u_shadow) {
    vec4 sh = dissolve_mask(tex * u_tint, uv);
    if (sh.a < 0.01) discard;
    fragColor = sh;
    return;
  }

  // Mode 18: Edition / Trigger Prismatic Rim Aura (drawn slightly expanded behind card)
  if (u_shaderMode == 18) {
    float ang = atan(uv.y - 0.5, uv.x - 0.5);
    float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rimMask = smoothstep(0.14, 0.0, edgeDist);
    // u_tint.a carries intensity; u_effectVec.x carries rainbow shift toggle (>0 = prismatic)
    vec3 rimCol = u_tint.rgb;
    if (u_effectVec.y > 0.5) {
      vec4 prism = RGB(vec4(fract(ang / 6.28318 + u_time * 0.42 + u_effectVec.x * 0.2), 0.95, 0.64, 1.0));
      rimCol = mix(rimCol, prism.rgb, 0.72);
    }
    float pulse = 0.78 + 0.22 * sin(u_time * 4.5 + ang * 2.0 + u_effectVec.x);
    vec4 aura = vec4(rimCol * (1.1 + 0.25 * rimMask), tex.a * u_tint.a * pulse * (0.55 + 0.45 * rimMask));
    vec4 outAura = dissolve_mask(aura, uv);
    if (outAura.a < 0.01) discard;
    fragColor = outAura;
    return;
  }

  // Mode 1: Foil (Liquid Chrome & Electric Silver-Blue Metallic Specular Overlay!)
  if (u_shaderMode == 1) {
    vec2 adjusted_uv = uv - vec2(0.5);
    adjusted_uv.x *= u_cellPixels.x / max(1.0, u_cellPixels.y);
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = min(high, max(0.52, 1.0 - low));
    float inkKeep = smoothstep(0.14, 0.38, high);

    vec2 foil = u_effectVec;
    // Crisp radial chrome interference + rotating brushed metallic rays
    float fac = max(min(2.0 * sin((length(86.0 * adjusted_uv) + foil.x * 2.2) +
      3.0 * (1.0 + 0.8 * cos(length(110.1121 * adjusted_uv) - foil.x * 3.121))) - 0.88 -
      max(4.5 - length(86.0 * adjusted_uv), 0.0), 1.0), 0.0);
    vec2 rotater = vec2(cos(foil.x * 0.28 + u_time * 0.35), sin(foil.x * 0.48 + u_time * 0.25));
    float angle = dot(rotater, adjusted_uv) / max(0.0001, length(rotater) * length(adjusted_uv));
    float fac2 = max(min(5.0 * cos(foil.y * 0.55 + angle * 3.14159 * (2.4 + 0.9 * sin(foil.x * 1.65 + 0.2 * foil.y))) -
      3.6 - max(1.8 - length(20.0 * adjusted_uv), 0.0), 1.0), 0.0);
    float fac3 = 0.34 * max(min(2.0 * sin(foil.x * 4.5 + uv.x * 4.4 + 3.0 * (1.0 + 0.5 * cos(foil.x * 6.5))) - 0.9, 1.0), -1.0);
    float fac4 = 0.34 * max(min(2.0 * sin(foil.x * 6.0 + uv.y * 4.8 + 3.0 * (1.0 + 0.5 * cos(foil.x * 3.414))) - 0.9, 1.0), -1.0);
    float maxfac = max(max(fac, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.2 * (fac + fac2 + fac3 + fac4), 0.0);

    // Focused diagonal metallic mirror band + twin hairline catchlight (never washes out center art!)
    float sweep = glossySweep(uv, foil.x * 0.55 + u_time * 0.48, 0.16, 0.62);
    float sweepHot = pow(sweep, 2.4);
    float spark = pixelSparkle(uv, vec2(12.0, 16.0), u_time + foil.x * 0.4, 0.85);
    float rim = 1.0 - smoothstep(0.0, 0.09, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));

    // Deep pewter-silver metallic valleys contrasted against razor-sharp ice-cobalt/lavender-silver peaks
    float waveTint = 0.5 + 0.5 * sin(uv.x * 10.0 - uv.y * 7.0 + foil.x * 2.2 + u_time * 1.1);
    vec3 metallicBase = mix(vec3(0.42, 0.66, 0.96), vec3(0.74, 0.72, 1.0), waveTint);
    vec3 chrome = mix(tex.rgb * vec3(0.84, 0.90, 1.02), metallicBase, 0.48 * inkKeep);
    chrome += vec3(0.28, 0.56, 0.98) * delta * min(1.35, maxfac * 0.32) * inkKeep;
    chrome += vec3(0.86, 0.96, 1.0) * (sweep * 0.34 + sweepHot * 0.58 + rim * 0.28);
    chrome += vec3(0.95, 0.99, 1.0) * spark * 0.95;

    tex.rgb = clamp(chrome, 0.0, 1.0);
    float overlayAlpha = 0.28 * tex.a * inkKeep + min(0.56, maxfac * 0.115) * inkKeep + sweep * 0.34 + sweepHot * 0.32 + rim * 0.22 + spark * 0.72;
    tex.a = min(tex.a, clamp(overlayAlpha, 0.0, 0.84));
  }
  // Mode 2: Holographic (Ultra-Vivid Diffraction Spectrum + Glowing Holo Foil Grid + Gloss!)
  else if (u_shaderMode == 2) {
    vec2 holo = u_effectVec;
    vec4 hsl = HSL(0.5 * tex + 0.5 * vec4(0.08, 0.04, 1.0, tex.a));
    float t = holo.y * 7.221 + u_time * 1.35;
    vec2 floored_uv = floor(uv * u_cellPixels) / u_cellPixels;
    vec2 uv_sc = (floored_uv - 0.5) * 230.0;

    vec2 fp1 = uv_sc + 50.0 * vec2(sin(-t / 143.6340), cos(-t / 99.4324));
    vec2 fp2 = uv_sc + 50.0 * vec2(cos( t / 53.1532),  cos( t / 61.4532));
    vec2 fp3 = uv_sc + 50.0 * vec2(sin(-t / 87.53218), sin(-t / 49.0000));
    float field = (1.0 + (
      cos(length(fp1) / 19.483) +
      sin(length(fp2) / 33.155) * cos(fp2.y / 15.73) +
      cos(length(fp3) / 27.193) * sin(fp3.x / 21.92)
    )) * 0.5;
    float res = 0.5 + 0.5 * cos(holo.x * 2.85 + (field - 0.5) * 3.14159);

    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float lum = (low + high) * 0.5;
    // Keep dark ink outlines razor-sharp & prevent pure-white card faces from blowing out
    float inkKeep = smoothstep(0.14, 0.36, high);
    float paperCalm = 1.0 - smoothstep(0.76, 0.96, low) * 0.38;
    float delta = (0.32 + 0.34 * (high - low) + 0.12 * high) * (0.42 + 0.58 * inkKeep) * paperCalm;

    // Razor-sharp glowing tri-axis holographic diamond foil hatching!
    float gridsize = 0.84;
    float g1 = max(0.0, 7.0 * abs(cos(uv.x * gridsize * 22.0 + holo.x * 0.25)) - 5.75);
    float g2 = max(0.0, 7.0 * cos(uv.y * gridsize * 46.0 + uv.x * gridsize * 22.0 - holo.x * 0.35) - 5.75);
    float g3 = max(0.0, 7.0 * cos(uv.y * gridsize * 46.0 - uv.x * gridsize * 22.0 + holo.x * 0.35) - 5.75);
    float fac = 0.54 * max(max(g1, g2), g3);
    float gridFlash = clamp(fac * 0.82, 0.0, 1.0);

    // Sweeping specular holographic rainbow reflection band
    float sweep = glossySweep(uv, holo.x * 0.62 + u_time * 0.55, 0.22, 0.72);
    float spark = pixelSparkle(uv, vec2(11.0, 15.0), u_time * 1.15 + holo.x * 0.5, 0.84);

    // Rich jewel-toned electric rainbow (magenta / electric blue / cyan / violet / gold)
    vec4 holoHsl = vec4(
      fract(hsl.x + res * 1.15 + fac * 0.52 + uv.y * 0.22 + holo.x * 0.08),
      clamp(max(0.78, hsl.y * 1.55), 0.78, 1.0),
      clamp(0.44 + lum * 0.22 + sweep * 0.12, 0.40, 0.76),
      tex.a
    );
    vec3 holoRgb = RGB(holoHsl).rgb * vec3(1.06, 0.90, 1.24);
    vec3 blended = mix(tex.rgb, holoRgb, clamp(delta, 0.0, 0.76));

    // Luminous holographic diamond-grid highlight + diagonal mirror sheen + sparkling pixel stars
    vec3 prismGlint = RGB(vec4(fract(res + uv.x * 0.75 + u_time * 0.28), 0.94, 0.68, 1.0)).rgb;
    blended += prismGlint * gridFlash * (0.22 + 0.34 * sweep) * inkKeep * (0.55 + 0.45 * paperCalm);
    blended += mix(prismGlint, vec3(1.0), 0.50) * pow(sweep, 1.9) * (0.30 + 0.16 * inkKeep);
    blended += vec3(1.0, 0.97, 1.0) * spark * 0.82;

    tex.rgb = clamp(blended, 0.0, 1.0);
    if (tex.a < 0.7) tex.a = tex.a / 3.0;
  }
  // Mode 3: Polychrome (Liquid Oil-Slick Prismatic Jewel + Dual Specular Glare + Starlight!)
  else if (u_shaderMode == 3) {
    vec2 poly = u_effectVec;
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = high - low;
    float sat_fac = 1.0 - max(0.0, 0.05 * (1.1 - delta));
    vec4 hsl = HSL(vec4(tex.r * sat_fac, tex.g * sat_fac, tex.b, tex.a));

    float t = poly.y * 2.5 + u_time * 1.25;
    vec2 floored_uv = floor(uv * u_cellPixels) / u_cellPixels;
    vec2 uv_sc = (floored_uv - 0.5) * 52.0;
    vec2 fp1 = uv_sc + 50.0 * vec2(sin(-t / 143.6340), cos(-t / 99.4324));
    vec2 fp2 = uv_sc + 50.0 * vec2(cos( t / 53.1532),  cos( t / 61.4532));
    vec2 fp3 = uv_sc + 50.0 * vec2(sin(-t / 87.53218), sin(-t / 49.0000));
    float field = (1.0 + (
      cos(length(fp1) / 19.483) +
      sin(length(fp2) / 33.155) * cos(fp2.y / 15.73) +
      cos(length(fp3) / 27.193) * sin(fp3.x / 21.92)
    )) * 0.5;
    float res = 0.5 + 0.5 * cos(poly.x * 2.75 + (field - 0.5) * 3.14159);

    hsl.x = fract(hsl.x + res * 1.15 + poly.y * 0.06);
    hsl.y = clamp(hsl.y + 0.68, 0.68, 0.96);
    // Keep bright card paper saturated rainbow jewel-tone while dark outlines stay sharp
    float inkMask = smoothstep(0.10, 0.30, high);
    hsl.z = mix(hsl.z, clamp(hsl.z * 0.72 + 0.20, 0.44, 0.74 + 0.08 * res), inkMask);

    vec3 polyRgb = RGB(hsl).rgb;

    // Dual counter-sweeping glossy prismatic specular streaks + pixel starlight glints!
    float sweepA = glossySweep(uv, poly.x * 0.58 + u_time * 0.52, 0.20, 0.55);
    float sweepB = glossySweep(uv, -poly.x * 0.36 + u_time * 0.38 + 1.1, 0.14, -0.45);
    float spark = pixelSparkle(uv, vec2(12.0, 16.0), u_time * 1.25 + poly.x * 0.45, 0.82);

    // Iridescent Fresnel edge gleam
    float edge = 1.0 - smoothstep(0.0, 0.10, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    vec3 edgePrism = RGB(vec4(fract(res + 0.35 + uv.x * 0.4), 1.0, 0.72, 1.0)).rgb;

    polyRgb += mix(edgePrism, vec3(1.0), 0.62) * pow(sweepA, 1.7) * 0.48;
    polyRgb += vec3(1.0, 0.96, 1.0) * pow(sweepB, 2.0) * 0.28;
    polyRgb += edgePrism * edge * 0.26;
    polyRgb += vec3(1.0) * spark * 0.90;

    tex.rgb = clamp(polyRgb, 0.0, 1.0);
    if (tex.a < 0.7) tex.a = tex.a / 3.0;
  }
  // Mode 4: Negative Base Inversion (Crisp Deep Obsidian Cosmic Invert!)
  else if (u_shaderMode == 4) {
    vec4 sat = HSL(tex);
    sat.z = 1.0 - sat.z;
    sat.x = fract(-sat.x + 0.22);
    sat.y = clamp(sat.y * 1.22, 0.0, 1.0);
    // Rich deep cosmic slate-indigo backing (less washed grey than 0.8 -> deep obsidian contrast!)
    vec3 invCol = RGB(sat).rgb + 0.44 * vec3(52.0 / 255.0, 68.0 / 255.0, 96.0 / 255.0);
    // Subtle luminous violet-cyan inverted edge glow
    float edge = 1.0 - smoothstep(0.0, 0.09, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    invCol += vec3(0.45, 0.32, 0.95) * edge * 0.30;
    tex.rgb = clamp(invCol, 0.0, 1.0);
    if (tex.a < 0.7) tex.a = tex.a / 3.0;
  }
  // Mode 5: Dissolve burn tint (dissolve.fs)
  else if (u_shaderMode == 5 && u_dissolve > 0.01) {
    if (u_burnColour2.a > 0.01) {
      tex.rgb = mix(tex.rgb, u_burnColour2.rgb, 0.6 * u_dissolve);
    } else if (u_burnColour1.a > 0.01) {
      tex.rgb = mix(tex.rgb, u_burnColour1.rgb, 0.6 * u_dissolve);
    }
  }
  // Mode 6: Debuff (debuff.fs — desaturated dim card with crisp crimson X)
  else if (u_shaderMode == 6) {
    vec4 sat = HSL(tex * 0.8 + 0.2 * vec4(1.0, 0.0, 0.0, tex.a));
    sat.y = 0.5;
    float width = 0.10;
    bool onCross =
      (uv.x + uv.y > 1.0 - width && uv.x + uv.y < 1.0 + width) ||
      ((1.0 - uv.x) + uv.y > 1.0 - width && (1.0 - uv.x) + uv.y < 1.0 + width);
    if (onCross) {
      sat.x = 0.0;
      sat.y = 0.76;
      sat.z = max(0.36, 0.78 * sat.z);
      tex.rgb = RGB(sat).rgb;
    } else {
      sat.y *= 0.42;
      sat.z *= 0.62;
      tex.rgb = RGB(sat).rgb;
    }
  }
  // Mode 7: Gold Seal / Wax Seal Shimmer (molten gold sweep + crisp star gleam!)
  else if (u_shaderMode == 7) {
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = max(0.35, high * 0.68);
    float gr = u_time * 0.65;
    float wave = glossySweep(uv, gr * 1.15 + u_effectVec.x * 0.3, 0.26, 0.65);
    float fac = 0.35 + 0.65 * sin((uv.x * 54.0 + sin(gr * 6.0) * 14.0) - 52.0 * gr)
                     - 0.35 * sin((uv.x * 24.0 + uv.y * 8.0) + 84.0 * gr);
    fac = clamp(max(fac, wave * 1.15), 0.0, 1.0);
    float spark = pixelSparkle(uv, vec2(10.0, 13.0), u_time * 1.6, 0.82);
    vec3 shine = mix(vec3(1.0, 0.90, 0.42), vec3(1.0, 0.99, 0.90), wave);
    tex.rgb = clamp(max(tex.rgb, mix(tex.rgb, shine, delta * fac)) + vec3(1.0, 0.96, 0.72) * spark * 0.85, 0.0, 1.0);
  }
  // Mode 8: Negative Shine Overlay (Electric Neon Violet/Cyan/Magenta Cosmic Aurora!)
  else if (u_shaderMode == 8) {
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = max(0.18, high - low);
    float nsr = u_effectVec.x;

    float fac  = 0.8 + 0.9 * sin(11.0 * uv.x + 4.32 * uv.y + nsr * 12.0 + cos(nsr * 5.3 + uv.y * 4.2 - uv.x * 4.0));
    float fac2 = 0.5 + 0.5 * sin(8.0 * uv.x + 2.32 * uv.y + nsr * 5.0 - cos(nsr * 2.3 + uv.x * 8.2));
    float fac3 = 0.5 + 0.5 * sin(10.0 * uv.x + 5.32 * uv.y + nsr * 6.111 + sin(nsr * 5.3 + uv.y * 3.2));
    float fac4 = 0.5 + 0.5 * sin(3.0 * uv.x + 2.32 * uv.y + nsr * 8.111 + sin(nsr * 1.3 + uv.y * 11.2));
    float fac5 = sin(0.9 * 16.0 * uv.x + 5.32 * uv.y + nsr * 12.0 + cos(nsr * 5.3 + uv.y * 4.2 - uv.x * 4.0));

    float maxfac = 0.78 * max(max(fac, max(fac2, max(fac3, 0.0))) + (fac + fac2 + fac3 * fac4), 0.0);
    float sweep = glossySweep(uv, nsr * 1.3 + u_time * 0.45, 0.24, -0.58);
    float spark = pixelSparkle(uv, vec2(12.0, 16.0), u_time * 1.3 + nsr, 0.84);

    // Electric neon violet / cyan / hot-magenta iridescent void sheen
    vec3 aurora = vec3(
      clamp(0.32 + delta * maxfac * (0.68 + fac5 * 0.34) + sweep * 0.42, 0.0, 1.0),
      clamp(0.24 + delta * maxfac * (0.58 - fac5 * 0.30) + sweep * 0.48, 0.0, 1.0),
      clamp(0.68 + delta * maxfac * 0.92 + sweep * 0.65, 0.0, 1.0)
    );
    aurora = clamp(aurora + vec3(0.75, 0.92, 1.0) * spark * 0.95, 0.0, 1.0);
    tex.rgb = aurora;
    float aVal = 0.32 * min(1.0, maxfac * 0.22) + sweep * 0.42 + spark * 0.72;
    tex.a = tex.a * clamp(aVal, 0.0, 0.76);
  }
  // Mode 10: Booster Pack Glossy Mylar Foil Sheen (Crisp Crinkle Specular & Iridescence!)
  else if (u_shaderMode == 10) {
    float br = u_effectVec.x;

    float fac  = 0.8 + 0.9 * sin(13.0 * uv.x + 5.32 * uv.y + br * 12.0 + cos(br * 5.3 + uv.y * 4.2 - uv.x * 4.0));
    float fac2 = 0.5 + 0.5 * sin(10.0 * uv.x + 2.32 * uv.y + br * 5.0 - cos(br * 2.3 + uv.x * 8.2));
    float fac3 = 0.5 + 0.5 * sin(12.0 * uv.x + 6.32 * uv.y + br * 6.111 + sin(br * 5.3 + uv.y * 3.2));
    float fac4 = 0.5 + 0.5 * sin(4.0 * uv.x + 2.32 * uv.y + br * 8.111 + sin(br * 1.3 + uv.y * 13.2));
    float fac5 = sin(0.5 * 16.0 * uv.x + 5.32 * uv.y + br * 12.0 + cos(br * 5.3 + uv.y * 4.2 - uv.x * 4.0));

    float maxfac = 0.72 * max(max(fac, max(fac2, max(fac3, 0.0))) + (fac + fac2 + fac3 * fac4), 0.0);
    // Crisp metallic mylar crinkle creases + dual sweeping mirror specular reflections
    float crinkle = smoothstep(1.85, 4.1, maxfac);
    float sweep = glossySweep(uv, br * 1.15 + u_time * 0.52, 0.25, 0.58);
    float sweep2 = glossySweep(uv, -br * 0.6 + u_time * 0.34 + 1.25, 0.14, 0.42);
    float spark = pixelSparkle(uv, vec2(9.0, 13.0), u_time * 1.35 + br, 0.81);
    // Bright sealed crimp-seam foil gleams at top & bottom of booster wrapper + metallic rim
    float seamGlint = (smoothstep(0.13, 0.02, uv.y) + smoothstep(0.87, 0.98, uv.y)) * (0.55 + 0.45 * sweep);
    float rim = 1.0 - smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));

    vec3 prismMylar = RGB(vec4(fract(uv.x * 0.55 + uv.y * 0.35 + u_time * 0.22 + br * 0.12), 0.72, 0.78, 1.0)).rgb;
    vec3 mylar = mix(
      mix(vec3(0.68 + fac5 * 0.22, 0.80 - fac5 * 0.12, 1.0), prismMylar, 0.42),
      vec3(1.0, 0.99, 1.0),
      clamp(crinkle * 0.65 + sweep * 0.80 + sweep2 * 0.5, 0.0, 1.0)
    );
    tex.rgb = clamp(mylar + vec3(1.0) * spark * 0.95, 0.0, 1.0);
    float outA = crinkle * 0.54 + pow(sweep, 1.35) * 0.62 + pow(sweep2, 1.7) * 0.36 + seamGlint * 0.44 + rim * 0.24 + spark * 0.82;
    tex.a = tex.a * clamp(outA, 0.0, 0.84);
  }
  // Mode 11: Voucher Prismatic Gold-Foil Ticket Sheen (Gilded Metallic Gleam!)
  else if (u_shaderMode == 11) {
    float vr = u_effectVec.x;

    float fac  = 0.8 + 0.9 * sin(13.0 * uv.x + 5.32 * uv.y + vr * 12.0 + cos(vr * 5.3 + uv.y * 4.2 - uv.x * 4.0));
    float fac2 = 0.5 + 0.5 * sin(10.0 * uv.x + 2.32 * uv.y + vr * 5.0 - cos(vr * 2.3 + uv.x * 8.2));
    float fac3 = 0.5 + 0.5 * sin(12.0 * uv.x + 6.32 * uv.y + vr * 6.111 + sin(vr * 5.3 + uv.y * 3.2));
    float fac4 = 0.5 + 0.5 * sin(4.0 * uv.x + 2.32 * uv.y + vr * 8.111 + sin(vr * 1.3 + uv.y * 13.2));
    float fac5 = sin(0.5 * 16.0 * uv.x + 5.32 * uv.y + vr * 12.0 + cos(vr * 5.3 + uv.y * 4.2 - uv.x * 4.0));

    float maxfac = 0.72 * max(max(fac, max(fac2, max(fac3, 0.0))) + (fac + fac2 + fac3 * fac4), 0.0);
    float ridge = smoothstep(1.80, 4.0, maxfac);
    float sweep = glossySweep(uv, vr * 1.1 + u_time * 0.50, 0.26, 0.68);
    float sweep2 = glossySweep(uv, -vr * 0.55 + u_time * 0.32 + 1.0, 0.14, 0.45);
    float spark = pixelSparkle(uv, vec2(9.0, 13.0), u_time * 1.45 + vr, 0.80);
    float border = 1.0 - smoothstep(0.0, 0.10, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));

    vec3 goldPrism = mix(
      vec3(1.0, 0.84 + fac5 * 0.12, 0.32 - fac5 * 0.12),
      vec3(1.0, 0.99, 0.86),
      clamp(sweep * 0.82 + sweep2 * 0.45 + ridge * 0.55, 0.0, 1.0)
    );
    tex.rgb = clamp(goldPrism + vec3(1.0, 0.97, 0.82) * (border * 0.32 + spark * 0.95), 0.0, 1.0);
    float outA = ridge * 0.48 + pow(sweep, 1.3) * 0.60 + pow(sweep2, 1.6) * 0.34 + border * 0.34 + spark * 0.82;
    tex.a = tex.a * clamp(outA, 0.0, 0.82);
  }
  // Mode 12: Non-scoring Played Card Dimming (played.fs)
  else if (u_shaderMode == 12) {
    vec4 sat = HSL(tex);
    sat.y = sat.y * 0.45 + 0.000001 * u_effectVec.x;
    sat.z = sat.z * 0.72;
    tex.rgb = RGB(sat).rgb;
    tex.a = tex.a * 0.88;
  }
  // Mode 13: Laminated 3D Card-Stock Gloss Overlay (for ALL cards & Royal Collector Title Ace!)
  // u_tint.a controls subtle gloss strength; u_effectVec.x = tilt/sway angle; u_effectVec.y = holo-hint (0 = pure gloss, >=0.6 = Royal Holo Title Ace)
  else if (u_shaderMode == 13) {
    float high = max(tex.r, max(tex.g, tex.b));
    float inkKeep = smoothstep(0.16, 0.40, high);
    float sweep = glossySweep(uv, u_effectVec.x * 0.52 + u_time * 0.32, 0.24, 0.54);
    float sweep2 = glossySweep(uv, -u_effectVec.x * 0.38 + u_time * 0.24 + 1.15, 0.15, -0.46);
    float sharp = pow(sweep, 2.0);
    // Crisp top/left studio rim catchlight responding to card tilt
    float edgeRim = 1.0 - smoothstep(0.0, 0.09, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    vec3 sheenCol = vec3(1.0, 0.99, 0.97);
    float holoDiamond = 0.0;
    if (u_effectVec.y > 0.05) {
      vec3 royalPrism = RGB(vec4(fract(uv.x * 0.85 + uv.y * 0.52 + u_time * 0.22 + u_effectVec.x * 0.24), 0.94, 0.70, 1.0)).rgb;
      sheenCol = mix(sheenCol, royalPrism, clamp(u_effectVec.y * 0.9, 0.0, 0.82));
      if (u_effectVec.y >= 0.55) {
        // Subtle regal collector-foil diamond shimmer across the white paper of the Title Ace!
        float d1 = max(0.0, 6.0 * cos(uv.y * 38.0 + uv.x * 20.0 - u_time * 0.8) - 4.9);
        float d2 = max(0.0, 6.0 * cos(uv.y * 38.0 - uv.x * 20.0 + u_time * 0.8) - 4.9);
        holoDiamond = clamp(max(d1, d2) * 0.55, 0.0, 1.0) * (0.38 + 0.62 * sweep) * inkKeep;
      }
    }
    float spark = u_effectVec.y > 0.2 ? pixelSparkle(uv, vec2(9.0, 13.0), u_time * 1.25, 0.82) : 0.0;
    tex.rgb = clamp(sheenCol + vec3(1.0) * (sharp * 0.35 + spark * 0.85), 0.0, 1.0);
    float a = (sharp * 0.62 + sweep * 0.26 + pow(sweep2, 1.8) * (u_effectVec.y >= 0.55 ? 0.34 : 0.0) + edgeRim * 0.36 + holoDiamond * 0.42) * u_tint.a * (0.45 + 0.55 * inkKeep) + spark * 0.76;
    tex.a = tex.a * clamp(a, 0.0, 0.80);
    // Return directly (bypass u_tint multiplication since u_tint.a already weighted alpha)
    vec4 outG = dissolve_mask(tex, uv);
    if (outG.a < 0.01) discard;
    fragColor = outG;
    return;
  }
  // Mode 14: Glass Card Crystalline Specular & Prism Refraction Overlay (m_glass)
  else if (u_shaderMode == 14) {
    float phase = u_effectVec.x * 0.55 + u_time * 0.42;
    float diag1 = smoothstep(0.14, 0.0, abs((uv.x * 0.9 + uv.y * 0.42) - (mod(phase, 2.2) - 0.5)));
    float diag2 = smoothstep(0.07, 0.0, abs((uv.x * 0.9 + uv.y * 0.42) - (mod(phase + 0.34, 2.2) - 0.5)));
    float bevel = 1.0 - smoothstep(0.0, 0.09, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    float spark = pixelSparkle(uv, vec2(10.0, 14.0), u_time * 1.3 + u_effectVec.x, 0.84);
    vec3 prism = mix(vec3(0.68, 0.95, 1.0), vec3(1.0, 0.98, 1.0), diag1);
    prism += vec3(0.45, 0.88, 1.0) * bevel * 0.58;
    tex.rgb = clamp(prism + vec3(1.0) * spark, 0.0, 1.0);
    tex.a = tex.a * clamp(diag1 * 0.62 + diag2 * 0.50 + bevel * 0.38 + spark * 0.82, 0.0, 0.84);
  }
  // Mode 15: Steel Card Brushed Metallic Anisotropic Sheen Overlay (m_steel)
  else if (u_shaderMode == 15) {
    float phase = u_effectVec.x * 0.65 + u_time * 0.42;
    float brush = 0.78 + 0.22 * sin(uv.y * 96.0);
    float band = glossySweep(uv, phase, 0.26, 0.48);
    float band2 = glossySweep(uv, -phase * 0.5 + 1.2, 0.12, 0.38);
    float edge = 1.0 - smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    float spark = pixelSparkle(uv, vec2(10.0, 14.0), u_time * 1.2 + u_effectVec.x, 0.84);
    vec3 steel = mix(vec3(0.72, 0.84, 0.98), vec3(1.0, 1.0, 1.0), pow(band, 1.35)) * brush;
    tex.rgb = clamp(steel + vec3(0.92, 0.97, 1.0) * (edge * 0.44 + spark * 0.92), 0.0, 1.0);
    tex.a = tex.a * clamp(pow(band, 1.25) * 0.66 + pow(band2, 1.6) * 0.32 + edge * 0.34 + spark * 0.76, 0.0, 0.82);
  }
  // Mode 16: Molten Gold Card Foil Gleam Overlay (m_gold)
  else if (u_shaderMode == 16) {
    float phase = u_effectVec.x * 0.6 + u_time * 0.48;
    float band = glossySweep(uv, phase, 0.27, 0.60);
    float shimmer = 0.5 + 0.5 * sin(uv.x * 26.0 + uv.y * 14.0 + u_time * 3.8 + u_effectVec.x * 4.0);
    float edge = 1.0 - smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    float spark = pixelSparkle(uv, vec2(9.0, 13.0), u_time * 1.5 + u_effectVec.x, 0.80);
    vec3 goldCol = mix(vec3(1.0, 0.82, 0.22), vec3(1.0, 0.99, 0.84), pow(band, 1.3));
    tex.rgb = clamp(goldCol + vec3(1.0, 0.97, 0.76) * (shimmer * 0.18 + edge * 0.36 + spark * 0.95), 0.0, 1.0);
    tex.a = tex.a * clamp(pow(band, 1.25) * 0.64 + shimmer * 0.18 + edge * 0.30 + spark * 0.84, 0.0, 0.84);
  }
  // Mode 17: Cosmic / Mystic / Wild / Lucky Shimmer Overlay
  // u_tint.rgb picks hue theme (celestial cyan, spectral violet, tarot gold, lucky emerald, wild prism)
  else if (u_shaderMode == 17) {
    float phase = u_effectVec.x * 0.55 + u_time * 0.45;
    float band = glossySweep(uv, phase, 0.25, 0.58);
    float spark = pixelSparkle(uv, vec2(10.0, 14.0), u_time * 1.25 + u_effectVec.x * 0.5, 0.85);
    vec3 col = u_tint.rgb;
    if (u_effectVec.y > 0.5) {
      // Prismatic Wild rainbow gleam
      col = RGB(vec4(fract(uv.x * 0.85 + uv.y * 0.55 + u_time * 0.35 + u_effectVec.x * 0.2), 0.95, 0.68, 1.0)).rgb;
    }
    tex.rgb = clamp(mix(col, vec3(1.0), pow(band, 1.6) * 0.65) + vec3(1.0) * spark * 0.85, 0.0, 1.0);
    float a = (pow(band, 1.4) * 0.48 + spark * 0.72) * u_tint.a;
    tex.a = tex.a * clamp(a, 0.0, 0.76);
    vec4 outC = dissolve_mask(tex, uv);
    if (outC.a < 0.01) discard;
    fragColor = outC;
    return;
  }

  // Radiant scoring trigger hit-flash (makes active scoring cards & Jokers POP!)
  if (u_triggerGlow > 0.01) {
    float edge = 1.0 - smoothstep(0.0, 0.16, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    vec3 glowTint = mix(vec3(1.0, 0.96, 0.84), vec3(1.0, 1.0, 1.0), u_triggerGlow);
    tex.rgb = clamp(tex.rgb + glowTint * u_triggerGlow * (0.34 + 0.45 * edge), 0.0, 1.0);
  }

  vec4 outCol = dissolve_mask(tex * u_tint, uv);
  if (outCol.a < 0.01) discard;
  fragColor = outCol;
}
`;

// ---------------------------------------------------------------------------
// Pass 3: Colossal Multi-Band Roaring Scoreboard Flames (flame.fs supercharged!)
// Renders crisp pixel-art roaring twin pillars with:
//   - Soft radiant plasma glow halo around the fire silhouette
//   - Wide vibrant roaring outer flame tongue (Electric Cobalt / Crimson-Orange)
//   - Blazing inner core tongue (Electric Cyan / Molten Gold-Yellow)
//   - Incandescent white-hot plasma heart & flying detached fire sparks at high scores
// ---------------------------------------------------------------------------

export const FLAME_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
uniform vec2 u_resolution;
uniform vec4 u_rect; // (x, y, w, h) in screen pixels (top-left origin)
out vec2 v_uv;

void main() {
  vec2 px = u_rect.xy + a_corner * u_rect.zw;
  vec2 ndc = vec2(
    (px.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (px.y / u_resolution.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = a_corner;
}
`;

export const FLAME_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_amount;
uniform vec4 u_colour1; // Primary outer flame color (electric cobalt / blazing scarlet)
uniform vec4 u_colour2; // Hot inner core color (blazing cyan / solar gold)
uniform float u_id;

#define FLAME_PIXEL_FAC 68.0

void main() {
  float intensity = min(10.0, u_amount);
  if (intensity < 0.08) discard;

  // v_uv.y = 0 at TOP (flame tips), v_uv.y = 1 at BOTTOM (behind Chips/Mult pill)
  vec2 uv = v_uv - 0.5;
  vec2 floored_uv = floor(uv * FLAME_PIXEL_FAC) / FLAME_PIXEL_FAC;
  vec2 uv_sc = floored_uv;

  // Dynamic upward turbulence accelerating with intensity
  float turbBoost = 1.0 + min(1.2, intensity * 0.14);
  uv_sc += uv_sc * 0.016 * turbBoost * (
    sin(-1.123 * floored_uv.x + 0.35 * u_time) *
    cos(5.3332 * floored_uv.y + u_time * 1.25)
  );

  // Rising fire convection speed scales dramatically with roar intensity
  float riseRate = 4.6 + min(3.4, intensity * 0.36);
  vec2 flame_up = vec2(0.0, mod(riseRate * u_time, 10000.0) - 5000.0 + mod(1.781 * u_id, 1000.0));

  float scale_fac = 6.8 + 2.6 / (1.8 + 1.8 * intensity);
  vec2 sv = uv_sc * scale_fac + flame_up;
  float speed = mod(20.781 * u_id, 100.0) + sin(u_time * 1.2 + u_id) * cos(u_time * 0.22 + u_id);
  vec2 sv2 = vec2(0.0);

  for (int i = 0; i < 5; i++) {
    sv2 += sv + 0.055 * sv2.yx * (mod(float(i), 2.0) > 1.0 ? -1.0 : 1.0)
         + 0.3 * (cos(length(sv) * 0.411) + 0.3344 * sin(length(sv)) - 0.23 * cos(length(sv)));
    sv += 0.5 * vec2(
      cos(cos(sv2.y) + speed * 0.0812) * sin(3.22 + sv2.x - speed * 0.1531),
      sin(-sv2.x * 1.21222 + 0.113785 * speed) * cos(sv2.y * 0.91213 - 0.13582 * speed)
    );
  }

  // Normalized height from base (0 at bottom -> 1 at top tip)
  float hNorm = clamp(1.0 - v_uv.y, 0.0, 1.0);
  // Wide roaring flame base around the pill tapering into tall licking tongues at top
  float baseEnvelope = mix(0.46, 0.22, pow(hNorm, 1.25));
  float xEdgePenalty = max(0.0, abs(uv.x) - baseEnvelope) * (7.2 + 3.2 * hNorm);

  // Height reach grows aggressively with intensity so even 1.2x target looks BOLD
  // and 5x-10x+ towers right to the top of the expanded flame canvas!
  float reachFactor = clamp(0.46 + intensity * 0.105, 0.48, 1.24);
  float heightPenalty = max(0.0, (hNorm / reachFactor) - 0.24);
  heightPenalty = heightPenalty * heightPenalty * (1.78 - min(0.75, intensity * 0.08));

  float rawNoise = length((sv - flame_up) / scale_fac * 4.4);
  float smoke_res = max(0.0, (rawNoise + 0.08 * (length(uv_sc) - 0.5)) * (2.0 / (2.25 + intensity * 0.28)));
  smoke_res += heightPenalty + xEdgePenalty;

  // Solid fiery anchor collar right behind/around the Chips & Mult pills (bottom 26% of quad)
  float collarDist = length((uv - vec2(0.0, 0.30)) * vec2(0.82, 2.35));
  if (collarDist < 0.42) {
    smoke_res -= (0.42 - collarDist) * (2.4 + min(2.2, intensity * 0.35));
  }

  // Soft outer radiant glow aura just outside the crisp pixel-art flame silhouette
  float haloMask = smoothstep(1.42, 0.98, smoke_res) * smoothstep(0.0, 0.14, 1.0 - abs(uv.x) * 2.0) * smoothstep(0.0, 0.10, v_uv.y);
  if (smoke_res > 1.0) {
    float haloAlpha = haloMask * (0.28 + min(0.32, intensity * 0.045));
    if (haloAlpha < 0.015) discard;
    vec3 haloRgb = mix(u_colour1.rgb, u_colour2.rgb, 0.28 + 0.22 * (1.0 - hNorm));
    fragColor = vec4(clamp(haloRgb * 1.15, 0.0, 1.0), haloAlpha);
    return;
  }

  // Multi-band crisp pixel-art fire coloring (outer vibrant hue -> blazing mid-core -> incandescent heart!)
  float innerCore = smoothstep(0.76, 0.42, smoke_res) * smoothstep(0.95, 0.15, hNorm);
  float whiteCore = smoothstep(0.46, 0.10, smoke_res) * smoothstep(0.72, 0.05, hNorm) * clamp(0.45 + intensity * 0.10, 0.45, 1.0);

  // Quantize slightly for razor-sharp stylized pixel-arcade flame bands
  float coreBand = floor(innerCore * 3.0 + 0.35) / 3.0;
  vec3 col = mix(u_colour1.rgb, u_colour2.rgb, clamp(coreBand * 0.92 + (1.0 - hNorm) * 0.26, 0.0, 1.0));

  // Add crackling bright flame-tip highlights dancing upward
  float tipHeat = smoothstep(0.68, 0.98, smoke_res) * smoothstep(0.2, 0.85, hNorm);
  col = mix(col, u_colour1.rgb * 1.15, tipHeat * 0.45);

  // Blazing white-hot incandescent core (shows brightly at medium roar & blinding at huge overkill!)
  vec3 hotWhite = mix(u_colour2.rgb, vec3(1.0, 0.99, 0.95), 0.78);
  col = mix(col, hotWhite, clamp(whiteCore * (0.62 + smoothstep(3.5, 9.0, intensity) * 0.38), 0.0, 0.96));

  // Slight fade right at very bottom border so it never forms a harsh horizontal seam under the box
  float bottomEdge = smoothstep(1.0, 0.92, v_uv.y);
  fragColor = vec4(clamp(col, 0.0, 1.0), bottomEdge);
}
`;

// ---------------------------------------------------------------------------
// Pass 3B: Crisp Instanced Particle Shader
// Shapes:
//   0 = crisp pixel square
//   1 = crisp pixel diamond
//   2 = faceted glass ice-shard
//   3 = 4-point holographic/foil sparkle star (with incandescent white core!)
//   4 = rising pixel flame wisp / blazing ember
// ---------------------------------------------------------------------------

export const PARTICLE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;   // 0..1 quad corner
layout(location = 1) in vec4 a_geom;     // (cx, cy, size, rotation)
layout(location = 2) in vec4 a_color;    // (r, g, b, a)
layout(location = 3) in float a_shape;   // 0=sq, 1=diamond, 2=glass, 3=sparkle star, 4=flame wisp

uniform vec2 u_resolution;
uniform vec2 u_shakeOffset;

out vec2 v_local;
out vec4 v_color;
out float v_shape;

void main() {
  vec2 local = a_corner - vec2(0.5);
  vec2 dim = vec2(a_geom.z);
  if (a_shape > 3.5) {
    // Tall crisp rising flame wisp
    dim = vec2(a_geom.z * 0.82, a_geom.z * 1.55);
  } else if (a_shape > 2.5) {
    // Generous 4-point sparkle star bounding quad
    dim = vec2(a_geom.z * 1.55);
  } else if (a_shape > 1.5) {
    // Faceted glass shard
    dim = vec2(a_geom.z * 0.72, a_geom.z * 1.45);
  }
  vec2 scaled = local * dim;

  float c = cos(a_geom.w);
  float s = sin(a_geom.w);
  vec2 rotated = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
  vec2 posPx = a_geom.xy + rotated + u_shakeOffset;

  vec2 ndc = vec2(
    (posPx.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (posPx.y / u_resolution.y) * 2.0
  );

  gl_Position = vec4(ndc, 0.0, 1.0);
  v_local = local * 2.0; // -1..1
  v_color = a_color;
  v_shape = a_shape;
}
`;

export const PARTICLE_FRAG = `#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_color;
in float v_shape;
out vec4 fragColor;

void main() {
  vec2 p = abs(v_local);
  vec3 col = v_color.rgb;
  float alpha = v_color.a;

  if (v_shape > 3.5) {
    // Shape 4: Crisp stylized pixel flame wisp / ember tongue
    float taper = mix(0.95, 0.15, clamp((1.0 - v_local.y) * 0.5, 0.0, 1.0));
    float d = (p.x / max(0.12, taper)) * 0.85 + p.y * 0.72;
    if (d > 1.0) discard;
    if (d < 0.45) {
      col = mix(col, vec3(1.0, 0.99, 0.92), 0.72);
    }
  } else if (v_shape > 2.5) {
    // Shape 3: Razor-sharp 4-point holographic/foil sparkle star
    float armX = step(p.y, 0.20 * (1.0 - p.x * 0.75)) * step(p.x, 1.0);
    float armY = step(p.x, 0.20 * (1.0 - p.y * 0.75)) * step(p.y, 1.0);
    float core = step(p.x + p.y, 0.42);
    float mask = max(max(armX, armY), core);
    if (mask < 0.5) discard;
    // Blazing white heart fading to vivid chromatic star tips
    float center = 1.0 - clamp(length(p) * 1.1, 0.0, 1.0);
    col = mix(col, vec3(1.0, 1.0, 1.0), clamp(center * 0.85 + core * 0.35, 0.0, 1.0));
  } else if (v_shape > 1.5) {
    // Shape 2: Crisp faceted diamond glass shard
    float d = p.x + p.y;
    if (d > 1.0) discard;
    if (v_local.x + v_local.y < 0.0) {
      col = mix(col, vec3(1.0), 0.42);
    }
    if (d > 0.76) {
      col = mix(col, vec3(0.75, 0.96, 1.0), 0.62);
    }
  } else if (v_shape > 0.5) {
    // Shape 1: Crisp pixel diamond with subtle dark rim & bright core
    float d = p.x + p.y;
    if (d > 1.0) discard;
    if (d < 0.38) {
      col = mix(col, vec3(1.0), 0.32);
    } else if (d > 0.80) {
      col *= 0.76;
    }
  } else {
    // Shape 0: Crisp pixel square with subtle inner highlight
    float edge = max(p.x, p.y);
    if (edge > 0.84) {
      col *= 0.78;
    }
  }

  if (alpha < 0.01) discard;
  fragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

// ---------------------------------------------------------------------------
// Pass 3C: Impact / Entry Radial Flash Overlay (flash.fs)
// ---------------------------------------------------------------------------

export const FLASH_VERT = BACKGROUND_VERT;

export const FLASH_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_midFlash;
uniform vec3 u_flashColor;

#define PIXEL_SIZE_FAC 700.0

void main() {
  if (u_midFlash <= 0.002) discard;

  vec2 screen_coords = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  float resLen = length(u_resolution);
  float pixel_size = resLen / PIXEL_SIZE_FAC;
  vec2 uv = (floor(screen_coords * (1.0 / pixel_size)) * pixel_size - 0.5 * u_resolution) / resLen;

  float dist = length(uv);
  float coreWave = min(1.0,
    (u_time > 2.5 ? max(0.0, sqrt(u_time - 2.5) - 60.0 * dist) : 0.0) +
    max(0.0, 1.0 - dist * 1.55)
  );
  float alpha = clamp(u_midFlash * (0.30 + 0.70 * coreWave), 0.0, 0.58);
  if (alpha < 0.005) discard;
  fragColor = vec4(u_flashColor, alpha);
}
`;

// ---------------------------------------------------------------------------
// Pass 4: Post-Pass — Screen Vortex Warp + Luminous Specular Bloom + Tuned CRT
// ---------------------------------------------------------------------------

export const CRT_VERT = BACKGROUND_VERT;

export const CRT_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_sceneTex;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_crtAmount;       // 0.0 .. 1.0 (maps from settings.crtAmount 0..100)
uniform float u_vortexStrength;  // 0.0 .. 1.0 smooth pulse envelope
uniform float u_vortexAmt;       // vortex.fs swirl parameter
uniform float u_glitchIntensity; // brief subtle CRT glitch impulse on boss/shatter
uniform float u_bloomBoost;      // 0..1 extra bloom energy during roaring flames & holo peaks

#define BUFF 0.01

void main() {
  vec2 baseUv = v_uv;

  // Exact vortex.fs polar swirl warp
  if (u_vortexStrength > 0.001) {
    float resLen = length(u_resolution);
    vec2 screenPos = baseUv * u_resolution;
    vec2 vuv = (screenPos - 0.5 * u_resolution) / resLen;
    float effectRadius = 1.6 - 0.05 * u_vortexAmt;
    float effectAngle = (0.5 + 0.15 * u_vortexAmt) * u_vortexStrength;
    float vlen = length(vuv * vec2(u_resolution.x / max(1.0, u_resolution.y), 1.0));
    float angle = atan(vuv.y, vuv.x) + effectAngle * smoothstep(effectRadius, 0.0, vlen);
    float radius = length(vuv);
    vec2 center = 0.5 * u_resolution / resLen;
    vec2 warpedPx = vec2(radius * cos(angle) + center.x, radius * sin(angle) + center.y) * resLen;
    baseUv = clamp(warpedPx / u_resolution, 0.001, 0.999);
  }

  vec2 tc = baseUv;
  float mask = 1.0;
  float crt_intensity = 0.12 * u_crtAmount;

  if (u_crtAmount > 0.005) {
    float bulge = 1.0 + 0.036 * u_crtAmount;
    float feather_fac = 0.014 * u_crtAmount;
    vec2 c = baseUv * 2.0 - vec2(1.0);
    c += (c.yx * c.yx) * c * (bulge - 1.0);
    mask = (1.0 - smoothstep(1.0 - feather_fac, 1.0, abs(c.x) - BUFF))
         * (1.0 - smoothstep(1.0 - feather_fac, 1.0, abs(c.y) - BUFF));
    tc = (c + vec2(1.0)) * 0.5;
    if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) {
      fragColor = vec4(0.025, 0.032, 0.04, 1.0);
      return;
    }
  }

  // Brief horizontal CRT glitch wave (from CRT.fs)
  float offset_l = 0.0;
  float offset_r = 0.0;
  if (u_glitchIntensity > 0.01) {
    float timefac = 3.0 * u_time;
    offset_l = 50.0 * (
      -3.5 +
      sin(timefac * 0.512 + tc.y * 40.0) +
      sin(-timefac * 0.8233 + tc.y * 81.532) +
      sin(timefac * 0.333 + tc.y * 30.3) +
      sin(-timefac * 0.1112331 + tc.y * 13.0)
    );
    offset_r = -50.0 * (
      -3.5 +
      sin(timefac * 0.6924 + tc.y * 29.0) +
      sin(-timefac * 0.9661 + tc.y * 41.532) +
      sin(timefac * 0.4423 + tc.y * 40.3) +
      sin(-timefac * 0.13321312 + tc.y * 11.0)
    );
    tc.x = clamp(tc.x + 0.0012 * u_glitchIntensity * clamp(offset_l, clamp(offset_r, -1.0, 0.0), 1.0), 0.0, 1.0);
  }

  vec4 crt_tex = texture(u_sceneTex, tc);
  float artifact_amp = (abs(clamp(offset_l, clamp(offset_r, -1.0, 0.0), 1.0)) * u_glitchIntensity > 0.9) ? 2.4 : 1.0;

  // Horizontal Chromatic Aberration
  float ca = min(0.32, crt_intensity * 2.1 * artifact_amp);
  float caOff = 0.00045 * (1.0 + 4.0 * (artifact_amp - 1.0)) * (1600.0 / max(640.0, u_resolution.x));
  if (ca > 0.001) {
    crt_tex.r = mix(crt_tex.r, texture(u_sceneTex, clamp(tc + vec2(caOff, 0.0), 0.0, 1.0)).r, ca);
    crt_tex.b = mix(crt_tex.b, texture(u_sceneTex, clamp(tc - vec2(caOff, 0.0), 0.0, 1.0)).b, ca);
  }

  vec3 rgb_result = crt_tex.rgb * (1.0 - 0.42 * crt_intensity * artifact_amp);

  // Subtle phosphor scanline grille
  if (crt_intensity > 0.001) {
    float scanlines = max(240.0, u_resolution.y * 0.62);
    vec3 rgb_scanline = vec3(
      clamp(-0.2 + 1.8 * sin(tc.y * scanlines - 0.7854) - 0.5 * clamp(sin(tc.x * scanlines * 3.0), 0.3, 1.0), -0.5, 1.2),
      clamp(-0.2 + 1.8 * cos(tc.y * scanlines) - 0.5 * clamp(cos(tc.x * scanlines * 3.0), 0.0, 1.0), -0.5, 1.2),
      clamp(-0.2 + 1.8 * cos(tc.y * scanlines - 1.0472) - 0.5 * clamp(cos(tc.x * scanlines * 3.0 - 0.7854), 0.0, 1.0), -0.5, 1.2)
    );
    rgb_result += crt_tex.rgb * rgb_scanline * crt_intensity * 0.28 * artifact_amp;
  }

  // Fine CRT film grain
  float noise_fac = 0.006 * u_crtAmount;
  if (noise_fac > 0.0005) {
    float nx = (tc.x - mod(tc.x, 0.002)) * (tc.y - mod(tc.y, 0.0013)) * (u_time * 60.0 + 13.7);
    nx = mod(nx, 13.0) * mod(nx, 123.0);
    float dx = mod(nx, 0.11) / 0.11;
    rgb_result = mix(rgb_result, vec3(dx), noise_fac);
  }

  if (u_crtAmount > 0.005) {
    rgb_result = (rgb_result - 0.5) * (1.0 + 0.08 * u_crtAmount) + 0.5;
    vec2 vigUv = baseUv * 2.0 - 1.0;
    float vig = 1.0 - dot(vigUv, vigUv) * 0.09 * u_crtAmount;
    rgb_result *= vig;
  }

  // Crisp Luminous Highlight Bloom (ALWAYS subtly active for holographic speculars, sparkles & flames!)
  float bloomStrength = 0.24 + 0.34 * u_crtAmount + 0.28 * u_bloomBoost;
  if (bloomStrength > 0.01) {
    vec2 bOff1 = vec2(2.4 / u_resolution.x, 2.4 / u_resolution.y);
    vec2 bOff2 = vec2(5.2 / u_resolution.x, 5.2 / u_resolution.y);
    vec3 bSum = vec3(0.0);
    for (int i = -1; i <= 1; ++i) {
      for (int j = -1; j <= 1; ++j) {
        if (i == 0 && j == 0) continue;
        float w = (i == 0 || j == 0) ? 1.0 : 0.65;
        vec3 s1 = texture(u_sceneTex, clamp(tc + vec2(float(i), float(j)) * bOff1, 0.0, 1.0)).rgb;
        vec3 s2 = texture(u_sceneTex, clamp(tc + vec2(float(i), float(j)) * bOff2, 0.0, 1.0)).rgb;
        // High-chroma speculars & pure white highlights bloom lushly without fogging midtones
        float sat1 = max(s1.r, max(s1.g, s1.b)) - min(s1.r, min(s1.g, s1.b));
        float thr1 = mix(0.74, 0.56, clamp(sat1 * 1.3, 0.0, 1.0));
        bSum += max(vec3(0.0), s1 - thr1) * w * 1.15;
        bSum += max(vec3(0.0), s2 - 0.72) * w * 0.55;
      }
    }
    rgb_result += (bSum / 6.6) * 0.42 * bloomStrength;
  }

  fragColor = vec4(clamp(rgb_result, 0.0, 1.0) * mask, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Shader Compilation Helper
// ---------------------------------------------------------------------------

export function compileProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  label: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc, `${label}:vert`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, `${label}:frag`);
  const prog = gl.createProgram();
  if (!prog) throw new Error(`Failed to create WebGLProgram (${label})`);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? 'unknown link error';
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(prog);
    throw new Error(`Program link failed (${label}): ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`Failed to create WebGLShader (${label})`);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown compile error';
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed (${label}): ${log}`);
  }
  return sh;
}
