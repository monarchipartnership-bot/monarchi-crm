// Type documentation only — this project is plain JS (no TypeScript), so
// these are JSDoc typedefs rather than real `type`/`interface` declarations.
// Referenced from crackPattern.js / shardPattern.js / ScreenCrackOverlay.jsx
// via `@typedef` imports for editor intellisense; nothing here runs.

/**
 * @typedef {Object} CrackSegment
 * @property {string} id
 * @property {Array<[number, number]>} points - canvas-space (1920x1080), polyline.
 * @property {number} width - stroke width in canvas px.
 * @property {number} delay - ms, draw-in animation start offset.
 * @property {number} duration - ms, draw-in animation length.
 * @property {boolean} [highlight] - main cracks only; renders an extra thin glass-edge highlight pass.
 */

/**
 * @typedef {Object} Shard
 * @property {string} id
 * @property {Array<[number, number]>} polygon - canvas-space (1920x1080), closed implicitly.
 * @property {[number, number]} center
 * @property {'small'|'medium'|'large'} size
 * @property {number} fallDelay - ms, staggered outward from the impact point.
 * @property {number} fallDirection - degrees, radial direction away from the impact point.
 * @property {1|-1} rotationDirection
 */

export {};
