export const collisionSemanticTypes = ['wall', 'furniture', 'building', 'terrain'] as const;
export type CollisionSemanticType = (typeof collisionSemanticTypes)[number];

const collisionNamespaces: Readonly<Record<string, string>> = {
  'map.home': 'home',
  'map.rain_station': 'rain',
  'map.shared_life': 'life',
  'map.return_corridor': 'return',
  'map.home_ending': 'ending',
};

export interface SemanticCollisionObject {
  id?: number;
  name?: string;
  type?: string;
}

export function collisionPrefixForMapId(mapId: string): string {
  const namespace = collisionNamespaces[mapId];
  if (!namespace) throw new Error(`不支持的地图 ID：${mapId}`);
  return `collision.${namespace}.`;
}

export function collisionSemanticIdError(mapId: string, name: string): string | null {
  const prefix = collisionPrefixForMapId(mapId);
  if (!name.startsWith(prefix)) return `碰撞 ID 必须以 ${prefix} 开头`;
  const suffix = name.slice(prefix.length);
  if (!/^[a-z][a-z0-9_]*$/.test(suffix)) return '碰撞 ID 后缀必须是英文 snake_case';
  if (/^(?:new(?:_.*)?|unnamed|temp|temporary|collision)$/.test(suffix)) {
    return '碰撞 ID 必须描述实际墙体、家具或地形，不能使用临时名称';
  }
  return null;
}

export function validateCollisionSemantics(
  mapId: string,
  objects: readonly SemanticCollisionObject[],
): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  for (const object of objects) {
    const name = object.name ?? '';
    const nameError = collisionSemanticIdError(mapId, name);
    if (nameError) errors.push(`${name || `object ${object.id ?? '?'}`}：${nameError}`);
    if (names.has(name)) errors.push(`碰撞 ID 重复：${name}`);
    names.add(name);
    if (!collisionSemanticTypes.includes(object.type as CollisionSemanticType)) {
      errors.push(`${name || `object ${object.id ?? '?'}`}：不支持的碰撞类型 ${object.type ?? ''}`);
    }
  }
  return errors;
}
