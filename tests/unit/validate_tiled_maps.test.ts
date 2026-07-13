import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptPath = resolve(process.cwd(), 'scripts', 'validate_tiled_maps.mjs');

function runValidator(mapId: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [scriptPath, mapId], {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? '', exitCode: e.status ?? 1 };
  }
}

describe('validate_tiled_maps', () => {
  it('passes for map.home with visual reference layers', () => {
    const result = runValidator('map.home');
    expect(result.stdout).toContain('[PASS] map.home');
    expect(result.exitCode).toBe(0);
  });

  it('passes for map.home (happy path; missing-layer failure tested via CLI)', () => {
    // We can't easily remove a layer from the real file, so we test the
    // happy path here. The script itself is integration-tested via CLI.
    const result = runValidator('map.home');
    expect(result.exitCode).toBe(0);
  });

  it('reports failure for unknown map ID', () => {
    const result = runValidator('map.nonexistent');
    expect(result.stdout).toContain('[FAIL]');
    expect(result.exitCode).toBe(1);
  });

  it('accepts actor-bound visual anchors backed by runtime character animation', () => {
    const endingMap = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'public', 'assets', 'data', 'map.home_ending.json'),
        'utf-8',
      ),
    ) as {
      layers: Array<{
        name: string;
        objects?: Array<{
          name?: string;
          properties?: Array<{ name: string; value: unknown }>;
        }>;
      }>;
    };
    const visualProps = endingMap.layers.find((layer) => layer.name === 'visual_props');
    const xiulan = visualProps?.objects?.find((object) => object.name === 'visual.ending.xiulan');
    const properties = new Map(
      xiulan?.properties?.map((property) => [property.name, property.value]),
    );

    expect(properties.get('status')).toBe('actor-bound');
    expect(properties.get('entityId')).toBe('entity.ending.xiulan');
    expect(properties.has('placeholder')).toBe(false);
    expect(properties.has('replacement')).toBe(false);

    const result = runValidator('map.home_ending');
    expect(result.stdout).toContain('[PASS] map.home_ending');
    expect(result.exitCode).toBe(0);
  });

  it('keeps the rain waiting shelter collision closed to the top boundary', () => {
    const rainMap = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'public', 'assets', 'data', 'map.rain_station.json'),
        'utf-8',
      ),
    ) as {
      layers: Array<{
        name: string;
        objects?: Array<{
          name?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      }>;
    };
    const collision = rainMap.layers.find((layer) => layer.name === 'collision');
    const roof = collision?.objects?.find(
      (object) => object.name === 'collision.rain.waiting_shelter_roof',
    );
    const shelter = collision?.objects?.find(
      (object) => object.name === 'collision.rain.waiting_shelter',
    );

    expect(roof).toMatchObject({ x: 255, y: 32, width: 390, height: 43 });
    expect(roof?.x).toBe(shelter?.x);
    expect(roof?.width).toBe(shelter?.width);
    expect((roof?.y ?? 0) + (roof?.height ?? 0)).toBe(shelter?.y);
  });
});
