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

export interface CollisionRect extends AxisAlignedRect {
  /** Clockwise degrees around the Tiled rectangle's top-left origin. */
  rotation?: number;
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

interface Axis {
  x: number;
  y: number;
}

interface SweepHit {
  time: number;
  normal: Axis;
}

const defaultBody: CollisionBody = { halfWidth: 16, halfHeight: 10 };
const epsilon = 1e-9;
const contactSeparation = 1e-7;
const maxSlideIterations = 8;

function radians(rect: CollisionRect): number {
  return ((rect.rotation ?? 0) * Math.PI) / 180;
}

function axes(rect: CollisionRect): readonly [Axis, Axis] {
  const angle = radians(rect);
  const rawCos = Math.cos(angle);
  const rawSin = Math.sin(angle);
  const cos = Math.abs(rawCos) <= epsilon ? 0 : rawCos;
  const sin = Math.abs(rawSin) <= epsilon ? 0 : rawSin;
  return [
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ];
}

export function collisionRectCenter(rect: CollisionRect): Point2D {
  const [horizontal, vertical] = axes(rect);
  return {
    x: rect.x + horizontal.x * (rect.width / 2) + vertical.x * (rect.height / 2),
    y: rect.y + horizontal.y * (rect.width / 2) + vertical.y * (rect.height / 2),
  };
}

export function collisionRectCorners(rect: CollisionRect): Point2D[] {
  const [horizontal, vertical] = axes(rect);
  const topRight = {
    x: rect.x + horizontal.x * rect.width,
    y: rect.y + horizontal.y * rect.width,
  };
  const bottomLeft = {
    x: rect.x + vertical.x * rect.height,
    y: rect.y + vertical.y * rect.height,
  };
  return [
    { x: rect.x, y: rect.y },
    topRight,
    { x: topRight.x + vertical.x * rect.height, y: topRight.y + vertical.y * rect.height },
    bottomLeft,
  ];
}

function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

export function overlapsCollision(
  point: Point2D,
  obstacle: CollisionRect,
  body: CollisionBody = defaultBody,
): boolean {
  if (obstacle.width <= 0 || obstacle.height <= 0) return false;
  const obstacleCenter = collisionRectCenter(obstacle);
  const obstacleAxes = axes(obstacle);
  const candidateAxes: readonly Axis[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...obstacleAxes];

  for (const axis of candidateAxes) {
    const centerDistance = Math.abs(
      dot({ x: obstacleCenter.x - point.x, y: obstacleCenter.y - point.y }, axis),
    );
    const playerRadius = body.halfWidth * Math.abs(axis.x) + body.halfHeight * Math.abs(axis.y);
    const obstacleRadius =
      (obstacle.width / 2) * Math.abs(dot(axis, obstacleAxes[0])) +
      (obstacle.height / 2) * Math.abs(dot(axis, obstacleAxes[1]));
    if (centerDistance >= playerRadius + obstacleRadius - epsilon) return false;
  }

  return true;
}

function isWalkable(
  point: Point2D,
  bounds: MovementBounds,
  obstacles: readonly CollisionRect[],
  body: CollisionBody,
): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY &&
    !obstacles.some((obstacle) => overlapsCollision(point, obstacle, body))
  );
}

/** Finds a nearby valid body centre after authored collision or saved positions change. */
export function findNearestWalkablePosition(
  preferred: Point2D,
  bounds: MovementBounds,
  obstacles: readonly CollisionRect[],
  body: CollisionBody = defaultBody,
): Point2D | null {
  const origin = {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, preferred.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, preferred.y)),
  };
  if (isWalkable(origin, bounds, obstacles, body)) return origin;

  const step = 4;
  const maxRadius = Math.ceil(
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / step,
  );
  const tryCandidate = (x: number, y: number): Point2D | null => {
    const candidate = { x, y };
    return isWalkable(candidate, bounds, obstacles, body) ? candidate : null;
  };

  for (let ring = 1; ring <= maxRadius; ring += 1) {
    const offset = ring * step;
    let nearestInRing: Point2D | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    const consider = (candidate: Point2D | null): void => {
      if (!candidate) return;
      const dx = candidate.x - origin.x;
      const dy = candidate.y - origin.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestDistanceSquared) {
        nearestInRing = candidate;
        nearestDistanceSquared = distanceSquared;
      }
    };
    for (let dx = -offset; dx <= offset; dx += step) {
      consider(tryCandidate(origin.x + dx, origin.y - offset));
      consider(tryCandidate(origin.x + dx, origin.y + offset));
    }
    for (let dy = -offset + step; dy <= offset - step; dy += step) {
      consider(tryCandidate(origin.x - offset, origin.y + dy));
      consider(tryCandidate(origin.x + offset, origin.y + dy));
    }
    if (nearestInRing) return nearestInRing;
  }

  return null;
}

function sweepAgainstRect(
  current: Point2D,
  delta: Point2D,
  body: CollisionBody,
  obstacle: CollisionRect,
): SweepHit | null {
  const obstacleCenter = collisionRectCenter(obstacle);
  const obstacleAxes = axes(obstacle);
  const candidateAxes: readonly Axis[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...obstacleAxes];
  let entryTime = Number.NEGATIVE_INFINITY;
  let exitTime = Number.POSITIVE_INFINITY;
  let collisionAxis: Axis | null = null;

  for (const axis of candidateAxes) {
    const centerDistance = dot(
      { x: obstacleCenter.x - current.x, y: obstacleCenter.y - current.y },
      axis,
    );
    const velocity = dot(delta, axis);
    const playerRadius = body.halfWidth * Math.abs(axis.x) + body.halfHeight * Math.abs(axis.y);
    const obstacleRadius =
      (obstacle.width / 2) * Math.abs(dot(axis, obstacleAxes[0])) +
      (obstacle.height / 2) * Math.abs(dot(axis, obstacleAxes[1]));
    const radius = playerRadius + obstacleRadius;

    if (Math.abs(velocity) <= epsilon) {
      if (Math.abs(centerDistance) >= radius - epsilon) return null;
      continue;
    }

    const first = (centerDistance - radius) / velocity;
    const second = (centerDistance + radius) / velocity;
    const axisEntry = Math.min(first, second);
    const axisExit = Math.max(first, second);
    if (axisEntry > entryTime) {
      entryTime = axisEntry;
      collisionAxis = axis;
    }
    exitTime = Math.min(exitTime, axisExit);
    if (entryTime - exitTime > epsilon) return null;
  }

  if (!collisionAxis || exitTime < -epsilon || entryTime > 1 + epsilon) return null;
  const time = Math.max(0, entryTime);
  const separationAtImpact = dot(
    {
      x: obstacleCenter.x - (current.x + delta.x * time),
      y: obstacleCenter.y - (current.y + delta.y * time),
    },
    collisionAxis,
  );
  const normal =
    separationAtImpact >= 0
      ? { x: -collisionAxis.x, y: -collisionAxis.y }
      : { x: collisionAxis.x, y: collisionAxis.y };

  if (dot(delta, normal) >= -epsilon) return null;
  return { time, normal };
}

export function moveWithCollisions(
  current: Point2D,
  delta: Point2D,
  bounds: MovementBounds,
  obstacles: readonly CollisionRect[],
  body: CollisionBody = defaultBody,
): Point2D {
  const clampedTarget = {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, current.x + delta.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, current.y + delta.y)),
  };
  const position = { ...current };
  let remaining = { x: clampedTarget.x - current.x, y: clampedTarget.y - current.y };

  for (let iteration = 0; iteration < maxSlideIterations; iteration += 1) {
    if (Math.abs(remaining.x) <= epsilon && Math.abs(remaining.y) <= epsilon) break;
    let nearest: SweepHit | null = null;
    for (const obstacle of obstacles) {
      if (obstacle.width <= 0 || obstacle.height <= 0) continue;
      const hit = sweepAgainstRect(position, remaining, body, obstacle);
      if (hit && (!nearest || hit.time < nearest.time)) {
        nearest = hit;
      }
    }

    if (!nearest) {
      position.x += remaining.x;
      position.y += remaining.y;
      break;
    }

    position.x += remaining.x * nearest.time;
    position.y += remaining.y * nearest.time;
    const remainingScale = Math.max(0, 1 - nearest.time);
    remaining = { x: remaining.x * remainingScale, y: remaining.y * remainingScale };
    const intoSurface = dot(remaining, nearest.normal);
    if (intoSurface < 0) {
      remaining.x -= nearest.normal.x * intoSurface;
      remaining.y -= nearest.normal.y * intoSurface;
    }
    if (Math.abs(remaining.x) > epsilon || Math.abs(remaining.y) > epsilon) {
      position.x += nearest.normal.x * contactSeparation;
      position.y += nearest.normal.y * contactSeparation;
    }
  }

  return position;
}
