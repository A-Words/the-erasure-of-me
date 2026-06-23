export interface Point2D {
  x: number;
  y: number;
}

export interface AxisAlignedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MovementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CollisionBody {
  halfWidth: number;
  halfHeight: number;
}

const defaultBody: CollisionBody = { halfWidth: 16, halfHeight: 10 };

function overlapsVertically(y: number, body: CollisionBody, obstacle: AxisAlignedRect): boolean {
  return y + body.halfHeight > obstacle.y && y - body.halfHeight < obstacle.y + obstacle.height;
}

function overlapsHorizontally(x: number, body: CollisionBody, obstacle: AxisAlignedRect): boolean {
  return x + body.halfWidth > obstacle.x && x - body.halfWidth < obstacle.x + obstacle.width;
}

export function moveWithCollisions(
  current: Point2D,
  delta: Point2D,
  bounds: MovementBounds,
  obstacles: readonly AxisAlignedRect[],
  body: CollisionBody = defaultBody,
): Point2D {
  let x = Math.max(bounds.minX, Math.min(bounds.maxX, current.x + delta.x));

  for (const obstacle of obstacles) {
    if (!overlapsVertically(current.y, body, obstacle)) continue;
    if (
      delta.x > 0 &&
      current.x + body.halfWidth <= obstacle.x &&
      x + body.halfWidth > obstacle.x
    ) {
      x = Math.min(x, obstacle.x - body.halfWidth);
    } else if (
      delta.x < 0 &&
      current.x - body.halfWidth >= obstacle.x + obstacle.width &&
      x - body.halfWidth < obstacle.x + obstacle.width
    ) {
      x = Math.max(x, obstacle.x + obstacle.width + body.halfWidth);
    }
  }

  let y = Math.max(bounds.minY, Math.min(bounds.maxY, current.y + delta.y));
  for (const obstacle of obstacles) {
    if (!overlapsHorizontally(x, body, obstacle)) continue;
    if (
      delta.y > 0 &&
      current.y + body.halfHeight <= obstacle.y &&
      y + body.halfHeight > obstacle.y
    ) {
      y = Math.min(y, obstacle.y - body.halfHeight);
    } else if (
      delta.y < 0 &&
      current.y - body.halfHeight >= obstacle.y + obstacle.height &&
      y - body.halfHeight < obstacle.y + obstacle.height
    ) {
      y = Math.max(y, obstacle.y + obstacle.height + body.halfHeight);
    }
  }

  return { x, y };
}
