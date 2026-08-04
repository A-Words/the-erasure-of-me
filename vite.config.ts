import { defineConfig } from 'vitest/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { validateCollisionSemantics } from './src/game/content/collisionSemantics';

const editableMapIds = new Set([
  'map.home',
  'map.rain_station',
  'map.shared_life',
  'map.return_corridor',
  'map.home_ending',
]);

function mapEditorSavePlugin(): Plugin {
  return {
    name: 'local-map-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const prefix = '/__map-editor/maps/';
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (request.method !== 'POST' || !pathname.startsWith(prefix)) {
          next();
          return;
        }

        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        const origin = request.headers.origin;
        const host = request.headers.host;
        if (origin && (!host || new URL(origin).host !== host)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ ok: false, error: '拒绝跨站地图写入请求' }));
          return;
        }
        if (!request.headers['content-type']?.startsWith('application/json')) {
          response.statusCode = 415;
          response.end(JSON.stringify({ ok: false, error: '地图保存请求必须使用 JSON' }));
          return;
        }
        const mapId = decodeURIComponent(pathname.slice(prefix.length));
        if (!editableMapIds.has(mapId)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ ok: false, error: '不允许写入这个地图 ID' }));
          return;
        }

        try {
          let body = '';
          for await (const chunk of request) {
            body += chunk;
            if (body.length > 2_000_000) throw new Error('地图 JSON 超过 2 MB 限制');
          }
          const data = JSON.parse(body) as { layers?: unknown };
          if (!data || !Array.isArray(data.layers)) throw new Error('无效的 Tiled 地图 JSON');
          const collisionLayer = data.layers.find(
            (
              layer,
            ): layer is {
              name: string;
              type?: string;
              objects?: Array<{ id?: number; name?: string; type?: string }>;
            } =>
              Boolean(layer) &&
              typeof layer === 'object' &&
              (layer as { name?: unknown }).name === 'collision',
          );
          if (!collisionLayer || !Array.isArray(collisionLayer.objects)) {
            throw new Error('地图缺少 collision 对象层');
          }
          const semanticErrors = validateCollisionSemantics(mapId, collisionLayer.objects);
          if (semanticErrors.length > 0) throw new Error(semanticErrors.join('；'));
          const output = resolve(process.cwd(), 'public', 'assets', 'data', `${mapId}.json`);
          await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          response.end(JSON.stringify({ ok: true }));
        } catch (error) {
          response.statusCode = 400;
          response.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [mapEditorSavePlugin()],
  build: { sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
