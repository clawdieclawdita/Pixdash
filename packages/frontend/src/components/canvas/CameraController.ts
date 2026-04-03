import type { CameraState } from '@/types';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DEFAULT_ZOOM = 1.6;
const DEFAULT_X = 128;
const DEFAULT_Y = 36;

export class CameraController {
  private state: CameraState;
  private dragOrigin: { x: number; y: number } | null = null;
  private readonly minZoom = 1;
  private readonly maxZoom = 3;

  constructor(initial?: Partial<CameraState>) {
    this.state = {
      x: initial?.x ?? DEFAULT_X,
      y: initial?.y ?? DEFAULT_Y,
      zoom: initial?.zoom ?? DEFAULT_ZOOM,
      isDragging: false
    };
  }

  getSnapshot(): CameraState {
    return { ...this.state };
  }

  applyTransform(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.state.zoom, 0, 0, this.state.zoom, this.state.x, this.state.y);
    ctx.imageSmoothingEnabled = false;
  }

  beginDrag(pointerX: number, pointerY: number) {
    this.dragOrigin = { x: pointerX - this.state.x, y: pointerY - this.state.y };
    this.state.isDragging = true;
  }

  drag(pointerX: number, pointerY: number) {
    if (!this.dragOrigin) return;
    this.state.x = pointerX - this.dragOrigin.x;
    this.state.y = pointerY - this.dragOrigin.y;
  }

  endDrag() {
    this.dragOrigin = null;
    this.state.isDragging = false;
  }

  zoomAt(pointerX: number, pointerY: number, deltaY: number) {
    const previousZoom = this.state.zoom;
    const nextZoom = clamp(previousZoom * (deltaY > 0 ? 0.9 : 1.1), this.minZoom, this.maxZoom);
    if (nextZoom === previousZoom) return;

    const worldX = (pointerX - this.state.x) / previousZoom;
    const worldY = (pointerY - this.state.y) / previousZoom;

    this.state.zoom = nextZoom;
    this.state.x = pointerX - worldX * nextZoom;
    this.state.y = pointerY - worldY * nextZoom;
  }

  centerOnMap(mapPxWidth: number, mapPxHeight: number, vpWidth: number, vpHeight: number) {
    this.state.x = (vpWidth - mapPxWidth * this.state.zoom) / 2;
    this.state.y = (vpHeight - mapPxHeight * this.state.zoom) / 2;
  }
}
