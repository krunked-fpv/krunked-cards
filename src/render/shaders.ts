// ============================================================================
// Krunked Cards — Complete WebGL2 GLSL ES 3.00 Shader Library
// Faithfully ported 1:1 from all 19 shader pipelines:
//   - Pass 1A: Title Splash Vortex (splash.fs)
//   - Pass 1B: Gameplay Felt Swirl (background.fs)
//   - Pass 2:  Card & Sprite Suite (Base, Foil, Holo, Polychrome, Negative,
//              Negative Shine, Hologram, Booster, Voucher, Played, Dissolve,
//              Debuff, Gold Seal + 3D skew.fs hover perspective & drop shadow)
//   - Pass 3:  Scoreboard Roar Flames (flame.fs)
//   - Pass 3B: Crisp Pixel-Square / Pixel-Diamond Particle Renderer
//   - Pass 4:  Impact Radial Flash (flash.fs) + Screen Vortex Warp (vortex.fs)
//              + Tuned CRT Post-Pass (CRT.fs)
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
// Pass 1A: Title Splash Vortex (exact port of splash.fs)
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
  float mod_flash = max(u_midFlash * 0.8, max(c1p, c2p) * 5.0 - 4.4) + u_midFlash * max(c1p, c2p);
  mod_flash = clamp(mod_flash, 0.0, 1.0);

  vec3 finalRgb = ret_col.rgb * (1.0 - mod_flash) + vec3(mod_flash);
  fragColor = vec4(clamp(finalRgb, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 1B: Gameplay Background Swirl (exact port of background.fs)
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
  speed = u_time * 2.0;
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
  fragColor = vec4(clamp(ret_col.rgb, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 2: Card & Sprite Shader (All 13 Card/Item Modes + skew.fs Perspective)
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
  float tiltDepth = (local.x * u_tilt.x + local.y * u_tilt.y) * 0.17;

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
    float hoverScale = 0.08 * (-0.03 - 0.3 * max(0.0, 0.3 - mid_dist))
                     * u_hovering * dot(mouse_offset, mouse_offset) / (2.0 - mid_dist);
    perspW += clamp(hoverScale, -0.11, 0.11);
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

  // Mode 9: Hologram (hologram.fs port — glowing cyan-emerald glitch scanline projection)
  // Handled before alpha-discard so the outer cyan aura radiates around transparent margins.
  if (u_shaderMode == 9 && !u_shadow) {
    if (uv.x > 0.96 || uv.x < 0.04 || uv.y > 0.96 || uv.y < 0.04) discard;

    vec2 cellMin = u_uvRect.xy;
    vec2 cellMax = u_uvRect.xy + u_uvRect.zw;
    vec2 glowStep = (vec2(1.45) / max(vec2(1.0), u_cellPixels)) * u_uvRect.zw;

    float glow = 0.0;
    float totalSamples = 0.0;
    for (int i = -4; i <= 4; ++i) {
      for (int j = -4; j <= 4; ++j) {
        vec2 sampleUv = clamp(v_texCoord + glowStep * vec2(float(i), float(j)), cellMin, cellMax);
        float sa = texture(u_tex, sampleUv).a;
        glow += min(0.85, sa);
        totalSamples += 1.0;
      }
    }
    glow /= max(1.0, 0.7 * totalSamples);

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

    float glitchShift = 0.018 * (-offset_l + offset_r) * u_uvRect.z;
    vec2 glitchedTc = vec2(clamp(v_texCoord.x + glitchShift, cellMin.x, cellMax.x), v_texCoord.y);
    vec4 htex = texture(u_tex, glitchedTc);

    float light_strength = 0.4 * (0.3 * sin(2.0 * u_effectVec.y) + 0.6 + 0.3 * sin(u_effectVec.x * 3.0) + 0.9);
    float glitchBoost = 1.0 + abs(offset_l) + abs(offset_r);
    float scanline = 0.88 + 0.12 * sin(uv.y * u_cellPixels.y * 3.14159 + u_time * 8.0);

    vec4 final_col;
    if (htex.a < 0.01) {
      final_col = vec4(0.0, 1.0, 0.55, 0.62) * light_strength * glitchBoost * glow;
    } else {
      vec3 holoTint = mix(htex.rgb, vec3(0.18, 0.95, 1.0), 0.32) * scanline;
      float baseA = min(0.84, htex.a);
      final_col = vec4(holoTint, baseA) * u_tint +
                  vec4(0.0, 0.35, 0.28, 0.32) * light_strength * glitchBoost * glow;
    }

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

  // Mode 1: Foil (exact foil.fs translucent metallic specular overlay pass!)
  if (u_shaderMode == 1) {
    vec2 adjusted_uv = uv - vec2(0.5);
    adjusted_uv.x *= u_cellPixels.x / max(1.0, u_cellPixels.y);
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = min(high, max(0.5, 1.0 - low));

    vec2 foil = u_effectVec;
    float fac = max(min(2.0 * sin((length(90.0 * adjusted_uv) + foil.x * 2.0) +
      3.0 * (1.0 + 0.8 * cos(length(113.1121 * adjusted_uv) - foil.x * 3.121))) - 1.0 -
      max(5.0 - length(90.0 * adjusted_uv), 0.0), 1.0), 0.0);
    vec2 rotater = vec2(cos(foil.x * 0.1221), sin(foil.x * 0.3512));
    float angle = dot(rotater, adjusted_uv) / max(0.0001, length(rotater) * length(adjusted_uv));
    float fac2 = max(min(5.0 * cos(foil.y * 0.3 + angle * 3.14159 * (2.2 + 0.9 * sin(foil.x * 1.65 + 0.2 * foil.y))) -
      4.0 - max(2.0 - length(20.0 * adjusted_uv), 0.0), 1.0), 0.0);
    float fac3 = 0.3 * max(min(2.0 * sin(foil.x * 5.0 + uv.x * 3.0 + 3.0 * (1.0 + 0.5 * cos(foil.x * 7.0))) - 1.0, 1.0), -1.0);
    float fac4 = 0.3 * max(min(2.0 * sin(foil.x * 6.66 + uv.y * 3.8 + 3.0 * (1.0 + 0.5 * cos(foil.x * 3.414))) - 1.0, 1.0), -1.0);
    float maxfac = max(max(fac, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.2 * (fac + fac2 + fac3 + fac4), 0.0);

    tex.r = clamp(tex.r - delta * 0.85 + delta * maxfac * 0.34, 0.0, 1.0);
    tex.g = clamp(tex.g - delta * 0.72 + delta * maxfac * 0.42, 0.0, 1.0);
    tex.b = clamp(tex.b + delta * maxfac * 1.9, 0.0, 1.0);
    tex.a = min(tex.a, 0.34 * tex.a + 0.92 * min(0.55, maxfac * 0.12));
  }
  // Mode 2: Holographic (exact holo.fs port — tri-harmonic diffraction + diagonal holo grid)
  else if (u_shaderMode == 2) {
    vec2 holo = u_effectVec;
    vec4 hsl = HSL(0.5 * tex + 0.5 * vec4(0.0, 0.0, 1.0, tex.a));
    float t = holo.y * 7.221 + u_time;
    vec2 floored_uv = floor(uv * u_cellPixels) / u_cellPixels;
    vec2 uv_sc = (floored_uv - 0.5) * 250.0;

    vec2 fp1 = uv_sc + 50.0 * vec2(sin(-t / 143.6340), cos(-t / 99.4324));
    vec2 fp2 = uv_sc + 50.0 * vec2(cos( t / 53.1532),  cos( t / 61.4532));
    vec2 fp3 = uv_sc + 50.0 * vec2(sin(-t / 87.53218), sin(-t / 49.0000));
    float field = (1.0 + (
      cos(length(fp1) / 19.483) +
      sin(length(fp2) / 33.155) * cos(fp2.y / 15.73) +
      cos(length(fp3) / 27.193) * sin(fp3.x / 21.92)
    )) * 0.5;
    float res = 0.5 + 0.5 * cos(holo.x * 2.612 + (field - 0.5) * 3.14159);

    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = 0.2 + 0.3 * (high - low) + 0.1 * high;
    float gridsize = 0.79;
    float fac = 0.5 * max(
      max(max(0.0, 7.0 * abs(cos(uv.x * gridsize * 20.0)) - 6.0),
          max(0.0, 7.0 * cos(uv.y * gridsize * 45.0 + uv.x * gridsize * 20.0) - 6.0)),
      max(0.0, 7.0 * cos(uv.y * gridsize * 45.0 - uv.x * gridsize * 20.0) - 6.0)
    );
    hsl.x = hsl.x + res + fac;
    hsl.y = min(1.0, hsl.y * 1.3);
    hsl.z = hsl.z * 0.6 + 0.4;
    tex.rgb = clamp((1.0 - delta) * tex.rgb + delta * (RGB(hsl).rgb * vec3(0.9, 0.8, 1.2)), 0.0, 1.0);
    if (tex.a < 0.7) tex.a = tex.a / 3.0;
  }
  // Mode 3: Polychrome (exact polychrome.fs port — vibrant iridescent prismatic wave)
  else if (u_shaderMode == 3) {
    vec2 poly = u_effectVec;
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = high - low;
    float sat_fac = 1.0 - max(0.0, 0.05 * (1.1 - delta));
    vec4 hsl = HSL(vec4(tex.r * sat_fac, tex.g * sat_fac, tex.b, tex.a));

    float t = poly.y * 2.221 + u_time;
    vec2 floored_uv = floor(uv * u_cellPixels) / u_cellPixels;
    vec2 uv_sc = (floored_uv - 0.5) * 50.0;
    vec2 fp1 = uv_sc + 50.0 * vec2(sin(-t / 143.6340), cos(-t / 99.4324));
    vec2 fp2 = uv_sc + 50.0 * vec2(cos( t / 53.1532),  cos( t / 61.4532));
    vec2 fp3 = uv_sc + 50.0 * vec2(sin(-t / 87.53218), sin(-t / 49.0000));
    float field = (1.0 + (
      cos(length(fp1) / 19.483) +
      sin(length(fp2) / 33.155) * cos(fp2.y / 15.73) +
      cos(length(fp3) / 27.193) * sin(fp3.x / 21.92)
    )) * 0.5;
    float res = 0.5 + 0.5 * cos(poly.x * 2.612 + (field - 0.5) * 3.14159);
    hsl.x = hsl.x + res + poly.y * 0.04;
    hsl.y = clamp(hsl.y + 0.55, 0.55, 0.80);
    // Keep bright white card backgrounds lushly iridescent instead of washing to pale pastel
    hsl.z = min(hsl.z, 0.78 + 0.08 * res);
    tex.rgb = clamp(RGB(hsl).rgb, 0.0, 1.0);
    if (tex.a < 0.7) tex.a = tex.a / 3.0;
  }
  // Mode 4: Negative Base Inversion (exact negative.fs port)
  else if (u_shaderMode == 4) {
    vec4 sat = HSL(tex);
    sat.z = 1.0 - sat.z;
    sat.x = -sat.x + 0.2;
    tex.rgb = clamp(RGB(sat).rgb + 0.8 * vec3(79.0 / 255.0, 99.0 / 255.0, 103.0 / 255.0), 0.0, 1.0);
    if (tex.a < 0.7) tex.a = tex.a / 3.0;
  }
  // Mode 5: Dissolve burn tint (exact dissolve.fs port)
  else if (u_shaderMode == 5 && u_dissolve > 0.01) {
    if (u_burnColour2.a > 0.01) {
      tex.rgb = mix(tex.rgb, u_burnColour2.rgb, 0.6 * u_dissolve);
    } else if (u_burnColour1.a > 0.01) {
      tex.rgb = mix(tex.rgb, u_burnColour1.rgb, 0.6 * u_dissolve);
    }
  }
  // Mode 6: Debuff (exact debuff.fs port — desaturated dim card with crisp crimson X)
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
  // Mode 7: Gold Seal shimmer (exact gold_seal.fs port)
  else if (u_shaderMode == 7) {
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = high * 0.5;
    float gr = u_time * 0.35;
    float fac = 0.3 + sin((uv.x * 64.0 + sin(gr * 6.0) * 18.0) - 70.0 * gr)
                    - sin((uv.x * 27.0 + uv.y * 6.0) + 108.0 * gr);
    fac = clamp(fac, 0.0, 1.0);
    tex.rgb = max(tex.rgb, (vec3(1.0) - tex.rgb) * delta * fac + tex.rgb);
  }
  // Mode 8: Negative Shine Overlay (exact negative_shine.fs translucent wave pass!)
  else if (u_shaderMode == 8) {
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = high - low - 0.1;
    float nsr = u_effectVec.x;

    float fac  = 0.8 + 0.9 * sin(11.0 * uv.x + 4.32 * uv.y + nsr * 12.0 + cos(nsr * 5.3 + uv.y * 4.2 - uv.x * 4.0));
    float fac2 = 0.5 + 0.5 * sin(8.0 * uv.x + 2.32 * uv.y + nsr * 5.0 - cos(nsr * 2.3 + uv.x * 8.2));
    float fac3 = 0.5 + 0.5 * sin(10.0 * uv.x + 5.32 * uv.y + nsr * 6.111 + sin(nsr * 5.3 + uv.y * 3.2));
    float fac4 = 0.5 + 0.5 * sin(3.0 * uv.x + 2.32 * uv.y + nsr * 8.111 + sin(nsr * 1.3 + uv.y * 11.2));
    float fac5 = sin(0.9 * 16.0 * uv.x + 5.32 * uv.y + nsr * 12.0 + cos(nsr * 5.3 + uv.y * 4.2 - uv.x * 4.0));

    float maxfac = 0.7 * max(max(fac, max(fac2, max(fac3, 0.0))) + (fac + fac2 + fac3 * fac4), 0.0);

    tex.rgb = tex.rgb * 0.5 + vec3(0.4, 0.4, 0.8);
    tex.r = clamp(tex.r - delta + delta * maxfac * (0.7 + fac5 * 0.27) - 0.1, 0.0, 1.0);
    tex.g = clamp(tex.g - delta + delta * maxfac * (0.7 - fac5 * 0.27) - 0.1, 0.0, 1.0);
    tex.b = clamp(tex.b - delta + delta * maxfac * 0.7 - 0.1, 0.0, 1.0);
    tex.a = tex.a * (
      0.5 * max(min(1.0, max(0.0, 0.3 * max(low * 0.2, delta) + min(max(maxfac * 0.1, 0.0), 0.4))), 0.0) +
      0.15 * maxfac * (0.1 + max(0.0, delta))
    );
    tex.a = clamp(tex.a, 0.0, 0.72);
  }
  // Mode 10: Booster Pack Glossy Foil Sheen Overlay (exact booster.fs port!)
  else if (u_shaderMode == 10) {
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = max(high - low, low * 0.7);
    float br = u_effectVec.x;

    float fac  = 0.8 + 0.9 * sin(13.0 * uv.x + 5.32 * uv.y + br * 12.0 + cos(br * 5.3 + uv.y * 4.2 - uv.x * 4.0));
    float fac2 = 0.5 + 0.5 * sin(10.0 * uv.x + 2.32 * uv.y + br * 5.0 - cos(br * 2.3 + uv.x * 8.2));
    float fac3 = 0.5 + 0.5 * sin(12.0 * uv.x + 6.32 * uv.y + br * 6.111 + sin(br * 5.3 + uv.y * 3.2));
    float fac4 = 0.5 + 0.5 * sin(4.0 * uv.x + 2.32 * uv.y + br * 8.111 + sin(br * 1.3 + uv.y * 13.2));
    float fac5 = sin(0.5 * 16.0 * uv.x + 5.32 * uv.y + br * 12.0 + cos(br * 5.3 + uv.y * 4.2 - uv.x * 4.0));

    float maxfac = 0.6 * max(max(fac, max(fac2, max(fac3, 0.0))) + (fac + fac2 + fac3 * fac4), 0.0);

    tex.rgb = tex.rgb * 0.5 + vec3(0.4, 0.4, 0.8);
    tex.r = clamp(tex.r - delta + delta * maxfac * (0.7 + fac5 * 0.07) - 0.1, 0.0, 1.0);
    tex.g = clamp(tex.g - delta + delta * maxfac * (0.7 - fac5 * 0.17) - 0.1, 0.0, 1.0);
    tex.b = clamp(tex.b - delta + delta * maxfac * 0.7 - 0.1, 0.0, 1.0);
    tex.a = tex.a * (
      0.8 * max(min(1.0, max(0.0, 0.3 * max(low * 0.2, delta) + min(max(maxfac * 0.1, 0.0), 0.4))), 0.0) +
      0.15 * maxfac * (0.1 + delta)
    );
    tex.a = clamp(tex.a * 0.75, 0.0, 0.62);
  }
  // Mode 11: Voucher Prismatic Gold Sheen Overlay (exact voucher.fs port!)
  else if (u_shaderMode == 11) {
    float low = min(tex.r, min(tex.g, tex.b));
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = high - low;
    float vr = u_effectVec.x;

    float fac  = 0.8 + 0.9 * sin(13.0 * uv.x + 5.32 * uv.y + vr * 12.0 + cos(vr * 5.3 + uv.y * 4.2 - uv.x * 4.0));
    float fac2 = 0.5 + 0.5 * sin(10.0 * uv.x + 2.32 * uv.y + vr * 5.0 - cos(vr * 2.3 + uv.x * 8.2));
    float fac3 = 0.5 + 0.5 * sin(12.0 * uv.x + 6.32 * uv.y + vr * 6.111 + sin(vr * 5.3 + uv.y * 3.2));
    float fac4 = 0.5 + 0.5 * sin(4.0 * uv.x + 2.32 * uv.y + vr * 8.111 + sin(vr * 1.3 + uv.y * 13.2));
    float fac5 = sin(0.5 * 16.0 * uv.x + 5.32 * uv.y + vr * 12.0 + cos(vr * 5.3 + uv.y * 4.2 - uv.x * 4.0));

    float maxfac = 0.6 * max(max(fac, max(fac2, max(fac3, 0.0))) + (fac + fac2 + fac3 * fac4), 0.0);

    tex.rgb = tex.rgb * 0.5 + vec3(0.45, 0.42, 0.72);
    tex.r = clamp(tex.r - delta + delta * maxfac * (0.74 + fac5 * 0.08) - 0.08, 0.0, 1.0);
    tex.g = clamp(tex.g - delta + delta * maxfac * (0.70 - fac5 * 0.14) - 0.08, 0.0, 1.0);
    tex.b = clamp(tex.b - delta + delta * maxfac * 0.64 - 0.10, 0.0, 1.0);
    tex.a = tex.a * (
      0.8 * max(min(1.0, max(0.0, 0.3 * max(low * 0.2, delta) + min(max(maxfac * 0.1, 0.0), 0.4))), 0.0) +
      0.15 * maxfac * (0.1 + delta)
    );
    tex.a = clamp(tex.a * 0.72, 0.0, 0.58);
  }
  // Mode 12: Non-scoring Played Card Dimming (faithful played.fs port)
  else if (u_shaderMode == 12) {
    vec4 sat = HSL(tex);
    sat.y = sat.y * 0.45 + 0.000001 * u_effectVec.x;
    sat.z = sat.z * 0.72;
    tex.rgb = RGB(sat).rgb;
    tex.a = tex.a * 0.88;
  }

  vec4 outCol = dissolve_mask(tex * u_tint, uv);
  if (outCol.a < 0.01) discard;
  fragColor = outCol;
}
`;

// ---------------------------------------------------------------------------
// Pass 3: Scoreboard Roar Flames (exact port of flame.fs)
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
uniform vec4 u_colour1;
uniform vec4 u_colour2;
uniform float u_id;

#define FLAME_PIXEL_FAC 60.0

void main() {
  float intensity = min(10.0, u_amount);
  if (intensity < 0.1) discard;

  vec2 uv = v_uv - 0.5;
  vec2 floored_uv = floor(uv * FLAME_PIXEL_FAC) / FLAME_PIXEL_FAC;
  vec2 uv_sc = floored_uv;
  uv_sc += uv_sc * 0.01 * (sin(-1.123 * floored_uv.x + 0.2 * u_time) * cos(5.3332 * floored_uv.y + u_time * 0.931));
  vec2 flame_up = vec2(0.0, mod(4.0 * u_time, 10000.0) - 5000.0 + mod(1.781 * u_id, 1000.0));

  float scale_fac = 7.5 + 3.0 / (2.0 + 2.0 * intensity);
  vec2 sv = uv_sc * scale_fac + flame_up;
  float speed = mod(20.781 * u_id, 100.0) + sin(u_time + u_id) * cos(u_time * 0.151 + u_id);
  vec2 sv2 = vec2(0.0);

  for (int i = 0; i < 5; i++) {
    sv2 += sv + 0.05 * sv2.yx * (mod(float(i), 2.0) > 1.0 ? -1.0 : 1.0)
         + 0.3 * (cos(length(sv) * 0.411) + 0.3344 * sin(length(sv)) - 0.23 * cos(length(sv)));
    sv += 0.5 * vec2(
      cos(cos(sv2.y) + speed * 0.0812) * sin(3.22 + sv2.x - speed * 0.1531),
      sin(-sv2.x * 1.21222 + 0.113785 * speed) * cos(sv2.y * 0.91213 - 0.13582 * speed)
    );
  }

  float smoke_res = max(0.0, (length((sv - flame_up) / scale_fac * 5.0) + 0.1 * (length(uv_sc) - 0.5)) * (2.0 / (2.0 + intensity * 0.2)));
  smoke_res = smoke_res + max(0.0, 2.0 - 0.3 * intensity) * max(0.0, 2.0 * (uv_sc.y - 0.5) * (uv_sc.y - 0.5));

  if (abs(uv.x) > 0.4) {
    smoke_res += 10.0 * (abs(uv.x) - 0.4);
  }
  if (length((uv - vec2(0.0, 0.1)) * vec2(0.19, 1.0)) < min(0.1, intensity * 0.5) && smoke_res > 1.0) {
    smoke_res += min(8.5, intensity * 10.0) * (length((uv - vec2(0.0, 0.1)) * vec2(0.19, 1.0)) - 0.1);
  }

  if (smoke_res > 1.0) discard;

  vec4 ret_col = u_colour1;
  if (uv.y < 0.12) {
    ret_col = ret_col * (1.0 - 0.5 * (0.12 - uv.y)) + 2.5 * (0.12 - uv.y) * u_colour2;
    ret_col += ret_col * (-2.0 + 0.5 * intensity * smoke_res) * (0.12 - uv.y);
  }
  // White-hot incandescent inner core at huge roar intensities (> 4.5)
  float hotCore = smoothstep(4.5, 9.5, intensity) * smoothstep(0.55, 0.05, smoke_res);
  ret_col.rgb = mix(ret_col.rgb, vec3(1.0, 0.98, 0.95), hotCore * 0.55);

  fragColor = vec4(clamp(ret_col.rgb, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 3B: Crisp Pixel-Square / Pixel-Diamond Particle Shader (Instanced)
// ---------------------------------------------------------------------------

export const PARTICLE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;   // 0..1 quad corner
layout(location = 1) in vec4 a_geom;     // (cx, cy, size, rotation)
layout(location = 2) in vec4 a_color;    // (r, g, b, a)
layout(location = 3) in float a_shape;   // 0 = crisp square, 1 = crisp diamond, 2 = glass shard

uniform vec2 u_resolution;
uniform vec2 u_shakeOffset;

out vec2 v_local;
out vec4 v_color;
out float v_shape;

void main() {
  vec2 local = a_corner - vec2(0.5);
  vec2 dim = (a_shape > 1.5) ? vec2(a_geom.z * 0.72, a_geom.z * 1.45) : vec2(a_geom.z);
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

  if (v_shape > 1.5) {
    // Crisp faceted diamond glass shard (no blur!)
    float d = p.x + p.y;
    if (d > 1.0) discard;
    if (v_local.x + v_local.y < 0.0) {
      col = mix(col, vec3(1.0), 0.35);
    }
    if (d > 0.78) {
      col = mix(col, vec3(0.75, 0.96, 1.0), 0.55);
    }
  } else if (v_shape > 0.5) {
    // Crisp pixel diamond with subtle dark rim
    float d = p.x + p.y;
    if (d > 1.0) discard;
    if (d > 0.8) {
      col *= 0.78;
    }
  } else {
    // Crisp pixel square with subtle inner highlight
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
// Pass 3C: Impact / Entry Radial Flash Overlay (exact port of flash.fs)
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

  // Faithful pixelated radial core + subtle edge falloff matching flash.fs
  float dist = length(uv);
  float coreWave = min(1.0,
    (u_time > 2.5 ? max(0.0, sqrt(u_time - 2.5) - 60.0 * dist) : 0.0) +
    max(0.0, 1.0 - dist * 1.65)
  );
  float alpha = clamp(u_midFlash * (0.28 + 0.72 * coreWave), 0.0, 0.55);
  if (alpha < 0.005) discard;
  fragColor = vec4(u_flashColor, alpha);
}
`;

// ---------------------------------------------------------------------------
// Pass 4: Post-Pass — Screen Vortex Warp (vortex.fs) + Tuned CRT (CRT.fs)
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

#define BUFF 0.01

void main() {
  vec2 baseUv = v_uv;

  // Exact vortex.fs polar swirl warp when opening Booster Packs or entering Boss Blinds
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

  if (u_crtAmount <= 0.005 && u_glitchIntensity <= 0.005) {
    fragColor = texture(u_sceneTex, baseUv);
    return;
  }

  // Tuned CRT.fs parameters harmonizing cleanly with the unified UI CRT overlay
  float crt_intensity = 0.12 * u_crtAmount;
  float bulge = 1.0 + 0.036 * u_crtAmount;
  float feather_fac = 0.014 * u_crtAmount;
  float noise_fac = 0.006 * u_crtAmount;
  float bloom_fac = 0.58 * u_crtAmount;
  float scanlines = max(240.0, u_resolution.y * 0.62);

  vec2 tc = baseUv * 2.0 - vec2(1.0);
  tc += (tc.yx * tc.yx) * tc * (bulge - 1.0);

  float mask = (1.0 - smoothstep(1.0 - feather_fac, 1.0, abs(tc.x) - BUFF))
             * (1.0 - smoothstep(1.0 - feather_fac, 1.0, abs(tc.y) - BUFF));

  tc = (tc + vec2(1.0)) * 0.5;
  if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) {
    fragColor = vec4(0.025, 0.032, 0.04, 1.0);
    return;
  }

  // Brief horizontal CRT glitch wave (from CRT.fs lines 41-65)
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

  // Horizontal Chromatic Aberration (CRT.fs lines 73-78)
  float ca = min(0.32, crt_intensity * 2.1 * artifact_amp);
  float caOff = 0.00045 * (1.0 + 4.0 * (artifact_amp - 1.0)) * (1600.0 / max(640.0, u_resolution.x));
  if (ca > 0.001) {
    crt_tex.r = mix(crt_tex.r, texture(u_sceneTex, clamp(tc + vec2(caOff, 0.0), 0.0, 1.0)).r, ca);
    crt_tex.b = mix(crt_tex.b, texture(u_sceneTex, clamp(tc - vec2(caOff, 0.0), 0.0, 1.0)).b, ca);
  }

  vec3 rgb_result = crt_tex.rgb * (1.0 - 0.42 * crt_intensity * artifact_amp);

  // Subtle phosphor scanline grille harmonized with the UI CRT overlay
  if (crt_intensity > 0.001) {
    vec3 rgb_scanline = vec3(
      clamp(-0.2 + 1.8 * sin(tc.y * scanlines - 0.7854) - 0.5 * clamp(sin(tc.x * scanlines * 3.0), 0.3, 1.0), -0.5, 1.2),
      clamp(-0.2 + 1.8 * cos(tc.y * scanlines) - 0.5 * clamp(cos(tc.x * scanlines * 3.0), 0.0, 1.0), -0.5, 1.2),
      clamp(-0.2 + 1.8 * cos(tc.y * scanlines - 1.0472) - 0.5 * clamp(cos(tc.x * scanlines * 3.0 - 0.7854), 0.0, 1.0), -0.5, 1.2)
    );
    rgb_result += crt_tex.rgb * rgb_scanline * crt_intensity * 0.28 * artifact_amp;
  }

  // Fine CRT film grain
  if (noise_fac > 0.0005) {
    float nx = (tc.x - mod(tc.x, 0.002)) * (tc.y - mod(tc.y, 0.0013)) * (u_time * 60.0 + 13.7);
    nx = mod(nx, 13.0) * mod(nx, 123.0);
    float dx = mod(nx, 0.11) / 0.11;
    rgb_result = mix(rgb_result, vec3(dx), noise_fac);
  }

  // Gentle contrast & brightness polish matching CRT.fs
  rgb_result = (rgb_result - 0.5) * (1.0 + 0.08 * u_crtAmount) + 0.5;

  // Gentle phosphor vignette
  vec2 vigUv = baseUv * 2.0 - 1.0;
  float vig = 1.0 - dot(vigUv, vigUv) * 0.09 * u_crtAmount;
  rgb_result *= vig;

  // Soft 9-tap phosphor bloom on bright highlights (flames, splash core, shiny editions)
  if (bloom_fac > 0.01) {
    vec2 bOff = vec2(2.2 / u_resolution.x, 2.2 / u_resolution.y);
    vec3 bSum = vec3(0.0);
    for (int i = -1; i <= 1; ++i) {
      for (int j = -1; j <= 1; ++j) {
        if (i == 0 && j == 0) continue;
        vec3 s = texture(u_sceneTex, clamp(tc + vec2(float(i), float(j)) * bOff, 0.0, 1.0)).rgb;
        float w = (i == 0 || j == 0) ? 1.0 : 0.65;
        bSum += max(vec3(0.0), s - 0.60) * w;
      }
    }
    rgb_result += (bSum / 6.6) * 0.28 * bloom_fac;
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
