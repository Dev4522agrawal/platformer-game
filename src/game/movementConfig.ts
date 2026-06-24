/**
 * The complete tuning surface for the player's movement. Every feel knob lives
 * here so tuning never touches Player.ts. This is also the seam for future robot
 * abilities: an ability produces a modified MovementConfig (e.g. higher jump,
 * lower gravity) and the Player is rebuilt/updated with it. v1 always uses
 * DEFAULT_MOVEMENT.
 *
 * Units: px and seconds. Frame-counts are fixed steps (FIXED_STEP = 1/60 s).
 */
export interface MovementConfig {
  /** Horizontal speed cap, px/s. */
  maxRunSpeed: number;
  /** Acceleration toward target while grounded with input, px/s^2. */
  groundAccel: number;
  /** Deceleration while grounded with no input, px/s^2. */
  groundDecelNoInput: number;
  /** Deceleration while grounded pressing opposite to motion, px/s^2. */
  groundDecelOpposite: number;
  /** Below this |vx| with no input, vx snaps to 0, px/s. */
  minMoveThreshold: number;

  /** Initial upward jump velocity (negative = up), px/s. */
  jumpVelocity: number;
  /** Gravity while descending, px/s^2. */
  gravityFall: number;
  /** Gravity while ascending with jump held, px/s^2. */
  gravityAscendHeld: number;
  /** Gravity while ascending after jump released (heavy cut), px/s^2. */
  gravityAscendReleased: number;
  /** Terminal fall speed, px/s. */
  maxFallSpeed: number;

  /** Grace window to still jump just after leaving a ledge, fixed steps. */
  coyoteFrames: number;
  /** Window to remember a jump press made just before landing, fixed steps. */
  jumpBufferFrames: number;

  /** When |vy| is below this near the apex, soften gravity, px/s. */
  apexHangThreshold: number;
  /** Gravity multiplier applied during apex hang. */
  apexHangFactor: number;
  /** Max duration of the apex-hang softening, fixed steps. */
  apexHangFrames: number;

  /** Acceleration toward target while airborne with input, px/s^2. */
  airAccel: number;
  /** Deceleration while airborne with no input, px/s^2. */
  airDecelNoInput: number;
  /** Deceleration while airborne pressing opposite to motion, px/s^2. */
  airDecelOpposite: number;

  /** Multiplies fall gravity while Down is held airborne. */
  fastFallMultiplier: number;
  /** Fall-speed cap while fast-falling, px/s. */
  fastFallMaxSpeed: number;
}

/** Starting-point tuning values. The human will adjust these for feel. */
export const DEFAULT_MOVEMENT: MovementConfig = {
  maxRunSpeed: 180,
  groundAccel: 1500,
  groundDecelNoInput: 1240,
  groundDecelOpposite: 3200,
  minMoveThreshold: 12,
  jumpVelocity: -420,
  gravityFall: 1000,
  gravityAscendHeld: 900,
  gravityAscendReleased: 1600,
  maxFallSpeed: 600,
  coyoteFrames: 8,
  jumpBufferFrames: 6,
  apexHangThreshold: 80,
  apexHangFactor: 0.6,
  apexHangFrames: 4,
  airAccel: 900,
  airDecelNoInput: 600,
  airDecelOpposite: 1400,
  fastFallMultiplier: 1.8,
  fastFallMaxSpeed: 900,
};
