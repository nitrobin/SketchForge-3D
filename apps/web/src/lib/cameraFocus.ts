/** Room left around an object the camera zooms to, as a share of its bounding sphere. */
export const CAMERA_FOCUS_MARGIN = 1.6;

/**
 * Distance from a perspective camera to a sphere of `radius` at which the sphere fits the view,
 * whichever of the vertical and horizontal field of view is narrower.
 */
export function perspectiveFocusDistance(radius: number, verticalFovDegrees: number, aspect: number, margin = CAMERA_FOCUS_MARGIN) {
  const vertical = (verticalFovDegrees * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.01, aspect));
  return (radius * margin) / Math.sin(Math.min(vertical, horizontal) / 2);
}

/** Orthographic camera zoom at which a sphere of `radius` fits a frustum of the given size. */
export function orthographicFocusZoom(radius: number, frustumWidth: number, frustumHeight: number, margin = CAMERA_FOCUS_MARGIN) {
  return Math.min(frustumWidth, frustumHeight) / (2 * radius * margin);
}

/** Smooth start and stop for a camera move, t from 0 to 1. */
export function easeInOutCubic(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}
