// ============================================================================
// Krunked Cards — WebGL2 GLSL ES 3.00 Shader Library
// Faithfully ported from the extracted shader math:
//   - Background swirl (PIXEL_SIZE_FAC=700, SPIN_EASE=0.5, 5-iter warp)
//   - Card/Sprite shader (Base, Foil, Holographic, Polychrome, Negative,
//     Dissolve, Debuff, Gold Seal + 3D hover skew + shadow pass)
//   - Scoreboard roar flame shader (log5 intensity-driven pixel fire)
//   - CRT post-processing pass (scanlines, chromatic aberration, gentle bulge, bloom)
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
} as const;

export type ShaderMode = (typeof SHADER_MODE)[keyof typeof SHADER_MODE];

// ---------------------------------------------------------------------------
// Pass 1: Background Swirl (background.fs port)
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
  fragColor = vec4(ret_col.rgb, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Pass 2: Card & Sprite Shader (Base + Foil + Holo + Polychrome + Negative +
//         Dissolve + Debuff + Gold Seal + Hover 3D Perspective Skew)
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
uniform float u_hovering;   // 0..1 hover depth factor
uniform vec2 u_mousePos;    // mouse screen pos (top-left origin)

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

  // Subtle pseudo-3D tilt warp when hovering/tilting
  vec2 posPx = u_center + rotated;
  float tiltDepth = (local.x * u_tilt.x + local.y * u_tilt.y) * 0.16;

  // Convert pixel coordinates (top-left origin) to NDC (-1..1, bottom-left origin)
  vec2 ndc = vec2(
    (posPx.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (posPx.y / u_resolution.y) * 2.0
  );

  float perspW = 1.0 + tiltDepth;
  if (u_hovering > 0.001) {
    float resLen = length(u_resolution);
    float mid_dist = length(posPx - 0.5 * u_resolution) / max(1.0, resLen);
    vec2 mouse_offset = (posPx - u_mousePos) / max(1.0, min(u_resolution.x, u_resolution.y) * 0.35);
    float hoverScale = 0.055 * (-0.03 - 0.3 * max(0.0, 0.3 - mid_dist))
                     * u_hovering * dot(mouse_offset, mouse_offset) / (2.0 - mid_dist);
    perspW += clamp(hoverScale, -0.09, 0.09);
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
uniform vec2 u_effectVec;   // edition animation phase (rotation/tilt + time seed)
uniform float u_dissolve;   // 0..1
uniform bool u_shadow;
uniform vec4 u_tint;
uniform vec2 u_cellPixels;  // e.g. (71.0, 95.0)
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
  vec4 tex = texture(u_tex, v_texCoord);
  if (tex.a < 0.01) discard;

  vec2 uv = v_localUv;
  if (u_shadow) {
    vec4 sh = dissolve_mask(tex * u_tint, uv);
    if (sh.a < 0.01) discard;
    fragColor = sh;
    return;
  }

  // Mode 1: Foil (foil.fs port — cool metallic specular shimmer blended cleanly over card)
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

    vec3 foilRgb = vec3(
      tex.r - delta * 0.45 + delta * maxfac * 0.32,
      tex.g - delta * 0.35 + delta * maxfac * 0.38,
      tex.b + delta * maxfac * 1.15
    );
    tex.rgb = mix(tex.rgb, clamp(foilRgb, 0.0, 1.0), 0.55);
  }
  // Mode 2: Holographic (holo.fs port — tri-harmonic diffraction field + holo grid)
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
    tex.rgb = (1.0 - delta) * tex.rgb + delta * (RGB(hsl).rgb * vec3(0.9, 0.8, 1.2));
  }
  // Mode 3: Polychrome (polychrome.fs port — vibrant iridescent prismatic rainbow)
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
    hsl.y = min(0.65, hsl.y + 0.5);
    tex.rgb = RGB(hsl).rgb;
  }
  // Mode 4: Negative (negative.fs + subtle negative_shine.fs sheen)
  else if (u_shaderMode == 4) {
    vec4 sat = HSL(tex);
    sat.z = 1.0 - sat.z;
    sat.x = -sat.x + 0.2;
    vec3 negCol = RGB(sat).rgb + 0.8 * vec3(79.0 / 255.0, 99.0 / 255.0, 103.0 / 255.0);
    // Subtle dark violet/cyan negative shine waves
    float ns = u_effectVec.x;
    float wave = 0.5 + 0.5 * sin(11.0 * uv.x + 4.32 * uv.y + ns * 3.0);
    tex.rgb = clamp(negCol * 0.92 + vec3(0.08, 0.05, 0.16) * wave, 0.0, 1.0);
  }
  // Mode 5: Dissolve burn tint
  else if (u_shaderMode == 5 && u_dissolve > 0.01) {
    if (u_burnColour2.a > 0.01) {
      tex.rgb = mix(tex.rgb, u_burnColour2.rgb, 0.6 * u_dissolve);
    } else if (u_burnColour1.a > 0.01) {
      tex.rgb = mix(tex.rgb, u_burnColour1.rgb, 0.6 * u_dissolve);
    }
  }
  // Mode 6: Debuff (debuff.fs port — desaturated dim card with crisp crimson X)
  else if (u_shaderMode == 6) {
    vec4 sat = HSL(tex * 0.8 + 0.2 * vec4(1.0, 0.0, 0.0, tex.a));
    sat.y = 0.5;
    float width = 0.095;
    bool onCross =
      (uv.x + uv.y > 1.0 - width && uv.x + uv.y < 1.0 + width) ||
      ((1.0 - uv.x) + uv.y > 1.0 - width && (1.0 - uv.x) + uv.y < 1.0 + width);
    if (onCross) {
      sat.x = 0.0;
      sat.y = 0.85;
      sat.z = max(0.38, 0.72 * sat.z);
      tex.rgb = RGB(sat).rgb;
    } else {
      sat.y *= 0.35;
      sat.z *= 0.58;
      tex.rgb = RGB(sat).rgb;
    }
  }
  // Mode 7: Gold Seal shimmer (gold_seal.fs port)
  else if (u_shaderMode == 7) {
    float high = max(tex.r, max(tex.g, tex.b));
    float delta = high * 0.5;
    float gr = u_time * 0.35;
    float fac = 0.3 + sin((uv.x * 45.0 + sin(gr * 6.0) * 18.0) - 70.0 * gr)
                    - sin((uv.x * 19.0 + uv.y * 3.0) + 108.0 * gr);
    fac = clamp(fac, 0.0, 1.0);
    tex.rgb = max(tex.rgb, (vec3(1.0) - tex.rgb) * delta * fac + tex.rgb);
  }

  vec4 outCol = dissolve_mask(tex * u_tint, uv);
  if (outCol.a < 0.01) discard;
  fragColor = outCol;
}
`;

// ---------------------------------------------------------------------------
// Pass 3: Scoreboard Roar Flames (flame.fs port)
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
  if (intensity < 0.08) discard;

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
  fragColor = vec4(clamp(ret_col.rgb, 0.0, 1.0), 0.95);
}
`;

// ---------------------------------------------------------------------------
// Pass 4: Optional CRT Post-Pass (CRT.fs port)
// ---------------------------------------------------------------------------

export const CRT_VERT = BACKGROUND_VERT;

export const CRT_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_sceneTex;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_crtAmount; // 0.0 .. 1.0 (maps from settings.crtAmount 0..100)

#define BUFF 0.01

void main() {
  if (u_crtAmount <= 0.005) {
    fragColor = texture(u_sceneTex, v_uv);
    return;
  }

  // Scale CRT parameters gently so pixel text & cards remain razor-crisp
  float crt_intensity = 0.14 * u_crtAmount;
  float bulge = 1.0 + 0.045 * u_crtAmount;
  vec2 scale_fac = vec2(1.0);
  float feather_fac = 0.015 * u_crtAmount;
  float noise_fac = 0.008 * u_crtAmount;
  float bloom_fac = 0.45 * u_crtAmount;
  float scanlines = max(240.0, u_resolution.y * 0.65);

  vec2 tc = v_uv * 2.0 - vec2(1.0);
  tc *= scale_fac;
  tc += (tc.yx * tc.yx) * tc * (bulge - 1.0);

  float mask = (1.0 - smoothstep(1.0 - feather_fac, 1.0, abs(tc.x) - BUFF))
             * (1.0 - smoothstep(1.0 - feather_fac, 1.0, abs(tc.y) - BUFF));

  tc = (tc + vec2(1.0)) * 0.5;
  if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) {
    fragColor = vec4(0.03, 0.04, 0.05, 1.0);
    return;
  }

  vec4 crt_tex = texture(u_sceneTex, tc);

  // Subtle horizontal chromatic aberration
  float ca = min(0.35, crt_intensity * 2.2);
  float caOff = 0.00045 * (1600.0 / max(640.0, u_resolution.x));
  crt_tex.r = mix(crt_tex.r, texture(u_sceneTex, tc + vec2(caOff, 0.0)).r, ca);
  crt_tex.b = mix(crt_tex.b, texture(u_sceneTex, tc - vec2(caOff, 0.0)).b, ca);

  vec3 rgb_result = crt_tex.rgb * (1.0 - 0.55 * crt_intensity);

  // Crisp pixel scanline phosphor mask
  vec3 rgb_scanline = vec3(
    clamp(-0.2 + 1.8 * sin(tc.y * scanlines - 0.7854) - 0.5 * clamp(sin(tc.x * scanlines * 3.0), 0.3, 1.0), -0.6, 1.4),
    clamp(-0.2 + 1.8 * cos(tc.y * scanlines) - 0.5 * clamp(cos(tc.x * scanlines * 3.0), 0.0, 1.0), -0.6, 1.4),
    clamp(-0.2 + 1.8 * cos(tc.y * scanlines - 1.0472) - 0.5 * clamp(cos(tc.x * scanlines * 3.0 - 0.7854), 0.0, 1.0), -0.6, 1.4)
  );
  rgb_result += crt_tex.rgb * rgb_scanline * crt_intensity * 0.42;

  // Fine film grain
  float nx = (tc.x - mod(tc.x, 0.002)) * (tc.y - mod(tc.y, 0.0013)) * (u_time * 60.0 + 13.7);
  nx = mod(nx, 13.0) * mod(nx, 123.0);
  float dx = mod(nx, 0.11) / 0.11;
  rgb_result = mix(rgb_result, vec3(dx), noise_fac);

  // Gentle vignette
  vec2 vigUv = v_uv * 2.0 - 1.0;
  float vig = 1.0 - dot(vigUv, vigUv) * 0.11 * u_crtAmount;
  rgb_result *= vig;

  // Soft 5-tap phosphor bloom on bright highlights
  if (bloom_fac > 0.01) {
    vec2 bOff = vec2(2.0 / u_resolution.x, 2.0 / u_resolution.y);
    vec3 bSum =
      max(vec3(0.0), texture(u_sceneTex, tc + vec2( bOff.x, 0.0)).rgb - 0.65) +
      max(vec3(0.0), texture(u_sceneTex, tc + vec2(-bOff.x, 0.0)).rgb - 0.65) +
      max(vec3(0.0), texture(u_sceneTex, tc + vec2(0.0,  bOff.y)).rgb - 0.65) +
      max(vec3(0.0), texture(u_sceneTex, tc + vec2(0.0, -bOff.y)).rgb - 0.65);
    rgb_result += bSum * 0.14 * bloom_fac;
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
