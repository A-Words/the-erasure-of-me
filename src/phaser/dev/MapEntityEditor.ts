import Phaser from 'phaser';
import { enableDevPanelDrag, type DevPanelPosition } from '../../ui/devPanelDrag';
import {
  asEditableTiledMap,
  cloneEditableMap,
  collisionPrefixForMapId,
  collisionSemanticTypes,
  collectMapEditorRecords,
  addCollisionRecord,
  deleteCollisionRecord,
  collisionHandlePoint,
  collisionLocalPoint,
  moveMapEditorRecord,
  resizeCollisionRecord,
  rotateCollisionRecord,
  updateCollisionMetadata,
  validateMapCollisionSemantics,
  type CollisionSemanticType,
  type EditableTiledMap,
  type MapEditorRecord,
} from './mapEditorModel';

interface EditorTarget {
  setPosition(x: number, y: number): void;
}

export interface MapEditorTargets {
  furniture: ReadonlyMap<string, EditorTarget>;
  interactables: ReadonlyMap<string, EditorTarget>;
}

interface EditorHandle {
  record: MapEditorRecord;
  shape: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  resizeGrip?: Phaser.GameObjects.Rectangle;
  rotationGrip?: Phaser.GameObjects.Arc;
}

const colors = {
  visual_furniture: 0x55d6be,
  interactables: 0xffcf5c,
  collision: 0xff667a,
} as const;

const layerLabels = {
  visual_furniture: '家具',
  interactables: '交互物',
  collision: '碰撞',
} as const;

let editorPanelPosition: DevPanelPosition | null = null;

export class MapEntityEditor {
  private readonly original: EditableTiledMap;
  private map: EditableTiledMap;
  private records: MapEditorRecord[] = [];
  private handles: EditorHandle[] = [];
  private selected: EditorHandle | null = null;
  private panel: HTMLElement | null = null;
  private grid = 1;
  private linkFurnitureCollision = true;
  private linkInteractableVisual = true;
  private statusTimer: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapId: string,
    rawMap: unknown,
    private readonly targets: MapEditorTargets,
  ) {
    this.map = cloneEditableMap(asEditableTiledMap(rawMap));
    this.original = cloneEditableMap(this.map);
    if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = false;
    this.mount();
  }

  destroy(): void {
    if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = true;
    this.handles.forEach(({ shape, label, resizeGrip, rotationGrip }) => {
      shape.destroy();
      label.destroy();
      resizeGrip?.destroy();
      rotationGrip?.destroy();
    });
    this.panel?.remove();
    this.panel = null;
    document.documentElement.classList.remove('map-editor-active');
  }

  private mount(): void {
    if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = false;
    this.records = collectMapEditorRecords(this.map);
    for (const record of this.records) this.createHandle(record);
    for (const record of this.records) this.updateTarget(record, record.displayX, record.displayY);
    this.createPanel();
    this.select(this.handles[0] ?? null);
  }

  private createHandle(record: MapEditorRecord): void {
    const color = colors[record.layerName];
    const shape = this.scene.add
      .rectangle(
        record.displayX,
        record.displayY,
        record.displayWidth,
        record.displayHeight,
        color,
        record.layerName === 'collision' ? 0.16 : 0.06,
      )
      .setStrokeStyle(2, color, 0.9)
      .setDepth(5000)
      .setInteractive({ draggable: true, useHandCursor: true });
    const label = this.scene.add
      .text(
        record.displayX,
        record.displayY - record.displayHeight / 2 - 5,
        record.object.name ?? '',
        {
          color: '#ffffff',
          backgroundColor: '#15191ee6',
          fontFamily: 'monospace',
          fontSize: '10px',
          padding: { x: 3, y: 2 },
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(5001)
      .setVisible(false);

    const handle: EditorHandle = { record, shape, label };
    if (record.layerName === 'collision') {
      handle.resizeGrip = this.scene.add
        .rectangle(record.displayX, record.displayY, 12, 12, 0xffffff, 1)
        .setStrokeStyle(2, color, 1)
        .setDepth(5002)
        .setInteractive({ draggable: true, useHandCursor: true })
        .setVisible(false);
      handle.resizeGrip.on('pointerdown', () => this.select(handle));
      handle.resizeGrip.on(
        'drag',
        (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          const local = collisionLocalPoint(record, dragX, dragY);
          const width = this.snap(local.x);
          const height = this.snap(local.y);
          resizeCollisionRecord(record, width, height, 'top_left');
          this.syncHandleGeometry(handle);
          this.updateCoordinateInputs(record);
        },
      );
      handle.rotationGrip = this.scene.add
        .circle(record.displayX, record.displayY, 7, 0x55d6be, 1)
        .setStrokeStyle(2, 0xffffff, 1)
        .setDepth(5002)
        .setInteractive({ draggable: true, useHandCursor: true })
        .setVisible(false);
      handle.rotationGrip.on('pointerdown', () => this.select(handle));
      handle.rotationGrip.on(
        'drag',
        (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          const angle =
            (Math.atan2(dragY - record.displayY, dragX - record.displayX) * 180) / Math.PI + 90;
          rotateCollisionRecord(record, Math.round(angle));
          this.syncHandleGeometry(handle);
          this.updateCoordinateInputs(record);
        },
      );
      this.syncHandleGeometry(handle);
    }
    shape.on('pointerdown', () => this.select(handle));
    shape.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      this.move(handle, this.snap(dragX), this.snap(dragY));
    });
    this.handles.push(handle);
  }

  private createPanel(): void {
    const panel = document.createElement('aside');
    panel.className = 'map-editor';
    panel.setAttribute('aria-label', '地图实体编辑器');
    panel.innerHTML = `
      <header data-editor-drag-handle tabindex="0" aria-label="移动地图实体编辑器，拖动或使用方向键"><strong>⠿ 地图实体编辑器</strong><span>${this.mapId}</span></header>
      <label>实体<select data-editor-select></select></label>
      <div class="map-editor-coordinates">
        <label>X <input data-editor-x type="number" step="1"></label>
        <label>Y <input data-editor-y type="number" step="1"></label>
      </div>
      <div class="map-editor-coordinates" data-editor-size-row hidden>
        <label>宽 <input data-editor-width type="number" min="8" step="1"></label>
        <label>高 <input data-editor-height type="number" min="8" step="1"></label>
      </div>
      <label data-editor-angle-row hidden>角度 <input data-editor-angle type="number" step="1">°</label>
      <fieldset data-editor-metadata hidden>
        <legend>选中碰撞的语义</legend>
        <label>ID <input data-editor-name type="text" spellcheck="false"></label>
        <label>类型 <select data-editor-type>${this.collisionTypeOptions()}</select></label>
        <button data-editor-apply-metadata type="button">应用名称和类型</button>
      </fieldset>
      <label>吸附 <input data-editor-grid type="number" min="1" max="64" value="1"></label>
      <label class="map-editor-check"><input data-editor-link-collision type="checkbox" checked> 家具联动碰撞</label>
      <label class="map-editor-check"><input data-editor-link-visual type="checkbox" checked> 交互热点联动图像</label>
      <p>拖动画布框移动；碰撞右下方方块缩放、上方圆点旋转。方向键可微调位置。</p>
      <fieldset>
        <legend>新增语义碰撞</legend>
        <label>ID <input data-editor-new-name type="text" spellcheck="false" placeholder="${collisionPrefixForMapId(this.mapId)}wall_name"></label>
        <label>类型 <select data-editor-new-type>${this.collisionTypeOptions()}</select></label>
        <button data-editor-add-collision type="button">新增碰撞</button>
      </fieldset>
      <div class="map-editor-actions">
        <button data-editor-delete-collision type="button" disabled>删除选中碰撞</button>
      </div>
      <div class="map-editor-actions">
        <button data-editor-save type="button">保存到地图文件</button>
        <button data-editor-download type="button">下载 JSON</button>
        <button data-editor-reset type="button">撤销本章修改</button>
      </div>
      <output data-editor-status aria-live="polite">编辑模式不会写入游戏存档。</output>
    `;
    document.body.append(panel);
    document.documentElement.classList.add('map-editor-active');
    this.panel = panel;
    enableDevPanelDrag(panel, panel.querySelector<HTMLElement>('[data-editor-drag-handle]')!, {
      initialPosition: editorPanelPosition,
      onPositionChange: (position) => {
        editorPanelPosition = position;
      },
    });

    const select = panel.querySelector<HTMLSelectElement>('[data-editor-select]')!;
    this.populateSelect();
    select.addEventListener('change', () => {
      this.select(this.handles.find((handle) => handle.record.key === select.value) ?? null);
    });
    const commitCoordinates = () => {
      if (!this.selected) return;
      const x = Number(panel.querySelector<HTMLInputElement>('[data-editor-x]')!.value);
      const y = Number(panel.querySelector<HTMLInputElement>('[data-editor-y]')!.value);
      if (Number.isFinite(x) && Number.isFinite(y)) this.move(this.selected, x, y);
    };
    panel
      .querySelector<HTMLInputElement>('[data-editor-x]')!
      .addEventListener('change', commitCoordinates);
    panel
      .querySelector<HTMLInputElement>('[data-editor-y]')!
      .addEventListener('change', commitCoordinates);
    const commitSize = () => {
      if (!this.selected || this.selected.record.layerName !== 'collision') return;
      const width = Number(panel.querySelector<HTMLInputElement>('[data-editor-width]')!.value);
      const height = Number(panel.querySelector<HTMLInputElement>('[data-editor-height]')!.value);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      resizeCollisionRecord(this.selected.record, width, height);
      this.syncHandleGeometry(this.selected);
      this.updateCoordinateInputs(this.selected.record);
    };
    panel
      .querySelector<HTMLInputElement>('[data-editor-width]')!
      .addEventListener('change', commitSize);
    panel
      .querySelector<HTMLInputElement>('[data-editor-height]')!
      .addEventListener('change', commitSize);
    panel
      .querySelector<HTMLInputElement>('[data-editor-angle]')!
      .addEventListener('change', (event) => {
        if (!this.selected || this.selected.record.layerName !== 'collision') return;
        const angle = Number((event.currentTarget as HTMLInputElement).value);
        if (!Number.isFinite(angle)) return;
        rotateCollisionRecord(this.selected.record, angle);
        this.syncHandleGeometry(this.selected);
        this.updateCoordinateInputs(this.selected.record);
      });
    panel
      .querySelector('[data-editor-apply-metadata]')!
      .addEventListener('click', () => this.applySelectedMetadata());
    panel
      .querySelector<HTMLInputElement>('[data-editor-grid]')!
      .addEventListener('change', (event) => {
        this.grid = Math.max(1, Number((event.currentTarget as HTMLInputElement).value) || 1);
      });
    panel
      .querySelector<HTMLInputElement>('[data-editor-link-collision]')!
      .addEventListener('change', (event) => {
        this.linkFurnitureCollision = (event.currentTarget as HTMLInputElement).checked;
      });
    panel
      .querySelector<HTMLInputElement>('[data-editor-link-visual]')!
      .addEventListener('change', (event) => {
        this.linkInteractableVisual = (event.currentTarget as HTMLInputElement).checked;
      });
    panel.querySelector('[data-editor-save]')!.addEventListener('click', () => void this.save());
    panel.querySelector('[data-editor-download]')!.addEventListener('click', () => this.download());
    panel.querySelector('[data-editor-reset]')!.addEventListener('click', () => this.reset());
    panel
      .querySelector('[data-editor-add-collision]')!
      .addEventListener('click', () => this.addCollision());
    panel
      .querySelector('[data-editor-delete-collision]')!
      .addEventListener('click', () => this.deleteSelectedCollision());
    panel.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.scene.input.enabled = false;
      window.addEventListener(
        'pointerup',
        () => {
          this.scene.input.enabled = true;
        },
        { once: true },
      );
    });
    panel.addEventListener('click', (event) => event.stopPropagation());
    panel.addEventListener('keydown', (event) => event.stopPropagation());
    window.addEventListener('keydown', this.onKeyDown);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      !this.selected ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : this.grid;
    this.move(
      this.selected,
      this.selected.record.displayX + direction[0] * amount,
      this.selected.record.displayY + direction[1] * amount,
    );
  };

  private select(handle: EditorHandle | null): void {
    this.selected?.shape.setStrokeStyle(2, colors[this.selected.record.layerName], 0.9);
    this.selected?.label.setVisible(false);
    this.selected?.resizeGrip?.setVisible(false);
    this.selected?.rotationGrip?.setVisible(false);
    this.selected = handle;
    if (!this.panel) return;
    if (!handle) {
      this.panel.querySelector<HTMLElement>('[data-editor-size-row]')!.hidden = true;
      this.panel.querySelector<HTMLElement>('[data-editor-angle-row]')!.hidden = true;
      this.panel.querySelector<HTMLElement>('[data-editor-metadata]')!.hidden = true;
      this.panel.querySelector<HTMLButtonElement>('[data-editor-delete-collision]')!.disabled =
        true;
      return;
    }
    handle.shape.setStrokeStyle(4, 0xffffff, 1);
    handle.label.setVisible(true);
    handle.resizeGrip?.setVisible(true);
    handle.rotationGrip?.setVisible(true);
    this.panel.querySelector<HTMLSelectElement>('[data-editor-select]')!.value = handle.record.key;
    const isCollision = handle.record.layerName === 'collision';
    this.panel.querySelector<HTMLElement>('[data-editor-size-row]')!.hidden = !isCollision;
    this.panel.querySelector<HTMLElement>('[data-editor-angle-row]')!.hidden = !isCollision;
    this.panel.querySelector<HTMLElement>('[data-editor-metadata]')!.hidden = !isCollision;
    this.panel.querySelector<HTMLButtonElement>('[data-editor-delete-collision]')!.disabled =
      !isCollision;
    this.updateCoordinateInputs(handle.record);
    if (isCollision) {
      this.panel.querySelector<HTMLInputElement>('[data-editor-name]')!.value =
        handle.record.object.name ?? '';
      this.panel.querySelector<HTMLSelectElement>('[data-editor-type]')!.value =
        handle.record.object.type ?? 'wall';
    }
  }

  private move(handle: EditorHandle, x: number, y: number): void {
    const previousX = handle.record.displayX;
    const previousY = handle.record.displayY;
    moveMapEditorRecord(this.map, handle.record, x, y, {
      linkFurnitureCollision: this.linkFurnitureCollision,
      linkInteractableVisual: this.linkInteractableVisual,
    });
    this.syncHandleGeometry(handle);
    this.updateTarget(handle.record, x, y);

    if (handle.record.layerName === 'visual_furniture' && this.linkFurnitureCollision) {
      const dx = x - previousX;
      const dy = y - previousY;
      const collisionId = this.propertyString(handle.record, 'collisionId');
      const collisionHandle = this.handles.find(
        (item) => item.record.layerName === 'collision' && item.record.object.name === collisionId,
      );
      if (collisionHandle) this.shiftHandle(collisionHandle, dx, dy);
    }
    this.updateCoordinateInputs(handle.record);
  }

  private shiftHandle(handle: EditorHandle, dx: number, dy: number): void {
    handle.record.displayX += dx;
    handle.record.displayY += dy;
    this.syncHandleGeometry(handle);
  }

  private syncHandleGeometry(handle: EditorHandle): void {
    const { record } = handle;
    handle.shape.setPosition(record.displayX, record.displayY);
    handle.shape.setSize(record.displayWidth, record.displayHeight);
    handle.shape.setAngle(record.displayRotation);
    if (handle.shape.input?.hitArea instanceof Phaser.Geom.Rectangle) {
      handle.shape.input.hitArea.setSize(record.displayWidth, record.displayHeight);
    }
    const labelPoint = collisionHandlePoint(record, 0, -record.displayHeight / 2 - 5);
    handle.label.setPosition(labelPoint.x, labelPoint.y);
    const resizePoint = collisionHandlePoint(
      record,
      record.displayWidth / 2,
      record.displayHeight / 2,
    );
    handle.resizeGrip?.setPosition(resizePoint.x, resizePoint.y);
    const rotationPoint = collisionHandlePoint(record, 0, -record.displayHeight / 2 - 28);
    handle.rotationGrip?.setPosition(rotationPoint.x, rotationPoint.y);
  }

  private populateSelect(): void {
    if (!this.panel) return;
    const select = this.panel.querySelector<HTMLSelectElement>('[data-editor-select]')!;
    select.replaceChildren();
    for (const [layerName, label] of Object.entries(layerLabels)) {
      const group = document.createElement('optgroup');
      group.label = label;
      for (const handle of this.handles.filter((item) => item.record.layerName === layerName)) {
        const option = document.createElement('option');
        option.value = handle.record.key;
        option.textContent = handle.record.object.name ?? handle.record.key;
        group.append(option);
      }
      select.append(group);
    }
  }

  private collisionTypeOptions(): string {
    const labels: Record<CollisionSemanticType, string> = {
      wall: '墙体',
      furniture: '家具',
      building: '建筑',
      terrain: '地形',
    };
    return collisionSemanticTypes
      .map((type) => `<option value="${type}">${labels[type]}</option>`)
      .join('');
  }

  private applySelectedMetadata(): void {
    const handle = this.selected;
    if (!handle || handle.record.layerName !== 'collision' || !this.panel) return;
    const name = this.panel.querySelector<HTMLInputElement>('[data-editor-name]')!.value.trim();
    const type = this.panel.querySelector<HTMLSelectElement>('[data-editor-type]')!
      .value as CollisionSemanticType;
    try {
      updateCollisionMetadata(this.map, handle.record, this.mapId, name, type);
      handle.label.setText(name);
      this.populateSelect();
      this.panel.querySelector<HTMLSelectElement>('[data-editor-select]')!.value =
        handle.record.key;
      this.setStatus(`已更新 ${name}；保存后写入地图文件。`);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  private addCollision(): void {
    if (!this.panel) return;
    const camera = this.scene.cameras.main;
    const nameInput = this.panel.querySelector<HTMLInputElement>('[data-editor-new-name]')!;
    const name = nameInput.value.trim();
    const type = this.panel.querySelector<HTMLSelectElement>('[data-editor-new-type]')!
      .value as CollisionSemanticType;
    let record: MapEditorRecord;
    try {
      record = addCollisionRecord(this.map, {
        centerX: camera.worldView.centerX,
        centerY: camera.worldView.centerY,
        mapId: this.mapId,
        name,
        type,
      });
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
      nameInput.focus();
      return;
    }
    this.records.push(record);
    this.createHandle(record);
    this.populateSelect();
    this.select(this.handles.at(-1) ?? null);
    nameInput.value = '';
    this.setStatus(`已新增 ${record.object.name}，保存前可继续改位置和大小。`);
  }

  private deleteSelectedCollision(): void {
    const handle = this.selected;
    if (!handle || handle.record.layerName !== 'collision') return;
    if (!window.confirm(`确定删除 ${handle.record.object.name ?? '这个碰撞'}？`)) return;
    if (!deleteCollisionRecord(this.map, handle.record)) return;
    const index = this.handles.indexOf(handle);
    handle.shape.destroy();
    handle.label.destroy();
    handle.resizeGrip?.destroy();
    handle.rotationGrip?.destroy();
    this.handles.splice(index, 1);
    this.records = this.records.filter((record) => record !== handle.record);
    this.selected = null;
    this.populateSelect();
    this.select(this.handles[Math.min(index, this.handles.length - 1)] ?? null);
    this.setStatus('已删除碰撞；点击保存后写入地图文件。');
  }

  private updateTarget(record: MapEditorRecord, x: number, y: number): void {
    const name = record.object.name;
    if (!name) return;
    if (record.layerName === 'visual_furniture')
      this.targets.furniture.get(name)?.setPosition(x, y);
    if (record.layerName === 'interactables')
      this.targets.interactables.get(name)?.setPosition(x, y);
  }

  private propertyString(record: MapEditorRecord, name: string): string | undefined {
    const value = record.object.properties?.find((property) => property.name === name)?.value;
    return typeof value === 'string' ? value : undefined;
  }

  private updateCoordinateInputs(record: MapEditorRecord): void {
    if (!this.panel) return;
    this.panel.querySelector<HTMLInputElement>('[data-editor-x]')!.value = String(
      Math.round(record.displayX * 100) / 100,
    );
    this.panel.querySelector<HTMLInputElement>('[data-editor-y]')!.value = String(
      Math.round(record.displayY * 100) / 100,
    );
    if (record.layerName === 'collision') {
      this.panel.querySelector<HTMLInputElement>('[data-editor-width]')!.value = String(
        Math.round(record.displayWidth * 100) / 100,
      );
      this.panel.querySelector<HTMLInputElement>('[data-editor-height]')!.value = String(
        Math.round(record.displayHeight * 100) / 100,
      );
      this.panel.querySelector<HTMLInputElement>('[data-editor-angle]')!.value = String(
        Math.round(record.displayRotation * 100) / 100,
      );
    }
  }

  private snap(value: number): number {
    return Math.round(value / this.grid) * this.grid;
  }

  private async save(): Promise<void> {
    try {
      const semanticErrors = validateMapCollisionSemantics(this.mapId, this.map);
      if (semanticErrors.length > 0) throw new Error(semanticErrors.join('；'));
      const response = await fetch(`/__map-editor/maps/${encodeURIComponent(this.mapId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.map),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      this.setStatus(`已保存 public/assets/data/${this.mapId}.json，请刷新验证碰撞。`);
    } catch (error) {
      this.setStatus(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private download(): void {
    const blob = new Blob([`${JSON.stringify(this.map, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.mapId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.setStatus('已下载当前章节 JSON。');
  }

  private reset(): void {
    this.destroy();
    this.map = cloneEditableMap(this.original);
    this.handles = [];
    this.selected = null;
    this.mount();
    this.setStatus('已撤销本章尚未保存的修改。');
  }

  private setStatus(message: string): void {
    if (!this.panel) return;
    this.panel.querySelector<HTMLOutputElement>('[data-editor-status]')!.textContent = message;
    if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      if (this.panel) {
        this.panel.querySelector<HTMLOutputElement>('[data-editor-status]')!.textContent =
          '编辑模式不会写入游戏存档。';
      }
    }, 5000);
  }
}
