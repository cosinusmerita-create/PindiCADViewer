// Angle of the launch screen's gear (SplashScreen.tsx), in degrees clockwise,
// as an explicit function of the time since the screen appeared.

// Angle profile (degrees, clockwise) - explicit, evaluated every frame:
//   0.0-0.2 s still; 0.2-0.5 s speed rises as a half sine 0 -> W; 0.5-1.7 s
//   constant W = 240 deg/s; 1.7-2.0 s symmetric slow-down; exactly 360 deg at
//   2.0 s (36 + 288 + 36), then held at 0 - the same position - so no
//   rounding drift can ever show.
const OMEGA = 240
const T_START = 0.2
const T_RAMP = 0.3
const T_CRUISE_END = 1.7
const T_END = 2.0
export const SPLASH_END_S = T_END
const RAMP_ANGLE = (OMEGA * T_RAMP) / 2 // 36

export function gearAngle(t: number): number {
  if (t <= T_START || t >= T_END) return 0
  if (t < T_START + T_RAMP) {
    const u = t - T_START
    return OMEGA * (u / 2 - (T_RAMP / (2 * Math.PI)) * Math.sin((Math.PI * u) / T_RAMP))
  }
  if (t < T_CRUISE_END) return RAMP_ANGLE + OMEGA * (t - (T_START + T_RAMP))
  const u = t - T_CRUISE_END
  return 360 - RAMP_ANGLE + OMEGA * (u / 2 + (T_RAMP / (2 * Math.PI)) * Math.sin((Math.PI * u) / T_RAMP))
}

