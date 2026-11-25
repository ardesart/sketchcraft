// Zoom Extents: how far back the camera stands to frame a model, and how close its near plane may come. The radius
// floor is small, so a desk-sized model fills the view the way a house does.
export const FIT_RADIUS_FLOOR = 0.02;
export const MAX_PERSPECTIVE_NEAR = 0.05;

const FIT_MARGIN = 1.05;
const MIN_PERSPECTIVE_NEAR = 0.0001;

export function fitRadius(size: { x: number; y: number; z: number }): number {
  return Math.max(Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) / 2, FIT_RADIUS_FLOOR);
}

export function fitDistance(radius: number, fovDeg: number): number {
  return (radius / Math.sin((fovDeg / 2) * (Math.PI / 180))) * FIT_MARGIN;
}

/** Keep the old near plane at normal distances, but move it in for close views. */
export function perspectiveNear(distance: number): number {
  return Math.max(MIN_PERSPECTIVE_NEAR, Math.min(MAX_PERSPECTIVE_NEAR, distance * 0.1));
}
