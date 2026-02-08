import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import './DevAssetStudio.css';

const ISO_TILE_WIDTH = 64;
const ISO_TILE_HEIGHT = 32;
const ISO_HALF_W = ISO_TILE_WIDTH * 0.5;
const ISO_HALF_H = ISO_TILE_HEIGHT * 0.5;
const STUDIO_MAP_SIZE = 25;

type StudioTab = 'image' | 'defense';
type ImageEditMode = 'footprint' | 'blockers' | 'placement' | 'image';
type ShapeKind = 'rect' | 'circle' | 'line';
type ShapeLayer = 'base' | 'turret' | 'projectile';

type IsoPoint = { x: number; y: number };
type TilePoint = { x: number; y: number };

interface ImageTransform {
  isoX: number;
  isoY: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
}

interface DefenseShape {
  id: string;
  name: string;
  kind: ShapeKind;
  layer: ShapeLayer;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  x2: number;
  y2: number;
  rotationDeg: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  alpha: number;
  angleAware: boolean;
}

interface ProjectileConfig {
  travelMs: number;
  arcHeight: number;
  radius: number;
  color: string;
  trailColor: string;
  splashRadius: number;
  loop: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function tileKey(x: number, y: number) {
  return `${x},${y}`;
}

function parseTileKey(key: string): TilePoint {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function toIso(cartX: number, cartY: number): IsoPoint {
  return {
    x: (cartX - cartY) * ISO_HALF_W,
    y: (cartX + cartY) * ISO_HALF_H
  };
}

function toCart(isoX: number, isoY: number): IsoPoint {
  return {
    x: (isoX / ISO_HALF_W + isoY / ISO_HALF_H) * 0.5,
    y: (isoY / ISO_HALF_H - isoX / ISO_HALF_W) * 0.5
  };
}

function resizeCanvas(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const targetWidth = Math.max(1, Math.floor(width * dpr));
  const targetHeight = Math.max(1, Math.floor(height * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  return { width, height, dpr };
}

function ensureBuffer(
  ref: MutableRefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  dpr: number
) {
  if (!ref.current) {
    ref.current = document.createElement('canvas');
  }
  const buffer = ref.current;
  const targetWidth = Math.max(1, Math.floor(width * dpr));
  const targetHeight = Math.max(1, Math.floor(height * dpr));
  if (buffer.width !== targetWidth || buffer.height !== targetHeight) {
    buffer.width = targetWidth;
    buffer.height = targetHeight;
  }
  return buffer;
}

function presentWithPixelation(
  destination: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  enabled: boolean,
  pixelSize: number,
  pixelBufferRef: MutableRefObject<HTMLCanvasElement | null>
) {
  destination.setTransform(dpr, 0, 0, dpr, 0, 0);
  destination.clearRect(0, 0, width, height);

  if (!enabled || pixelSize <= 1) {
    destination.imageSmoothingEnabled = true;
    destination.drawImage(source, 0, 0, width * dpr, height * dpr, 0, 0, width, height);
    return;
  }

  const pixelBuffer = ensureBuffer(pixelBufferRef, width, height, 1);
  const smallW = Math.max(1, Math.floor(width / pixelSize));
  const smallH = Math.max(1, Math.floor(height / pixelSize));
  pixelBuffer.width = smallW;
  pixelBuffer.height = smallH;

  const pixelCtx = pixelBuffer.getContext('2d');
  if (!pixelCtx) return;

  pixelCtx.setTransform(1, 0, 0, 1, 0, 0);
  pixelCtx.clearRect(0, 0, smallW, smallH);
  pixelCtx.imageSmoothingEnabled = false;
  pixelCtx.drawImage(source, 0, 0, width * dpr, height * dpr, 0, 0, smallW, smallH);

  destination.imageSmoothingEnabled = false;
  destination.drawImage(pixelBuffer, 0, 0, smallW, smallH, 0, 0, width, height);
}

function defaultDefenseShapes(): DefenseShape[] {
  return [
    {
      id: 'shape_base_plate',
      name: 'Base Plate',
      kind: 'rect',
      layer: 'base',
      x: 0,
      y: 2,
      width: 56,
      height: 30,
      radius: 10,
      x2: 0,
      y2: 0,
      rotationDeg: 0,
      fill: '#4f4f4f',
      stroke: '#888888',
      strokeWidth: 2,
      alpha: 1,
      angleAware: false
    },
    {
      id: 'shape_pivot',
      name: 'Pivot',
      kind: 'circle',
      layer: 'turret',
      x: 0,
      y: -8,
      width: 0,
      height: 0,
      radius: 8,
      x2: 0,
      y2: 0,
      rotationDeg: 0,
      fill: '#303030',
      stroke: '#777777',
      strokeWidth: 2,
      alpha: 1,
      angleAware: true
    },
    {
      id: 'shape_barrel',
      name: 'Barrel',
      kind: 'line',
      layer: 'turret',
      x: 0,
      y: -12,
      width: 0,
      height: 0,
      radius: 0,
      x2: 34,
      y2: -16,
      rotationDeg: 0,
      fill: '#000000',
      stroke: '#1f1f1f',
      strokeWidth: 8,
      alpha: 1,
      angleAware: true
    },
    {
      id: 'shape_projectile',
      name: 'Projectile',
      kind: 'circle',
      layer: 'projectile',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      radius: 5,
      x2: 0,
      y2: 0,
      rotationDeg: 0,
      fill: '#f17f2a',
      stroke: '#f8d3aa',
      strokeWidth: 1,
      alpha: 1,
      angleAware: false
    }
  ];
}

function rotatePoint(point: IsoPoint, deg: number): IsoPoint {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

function transformTurretPoint(point: IsoPoint, angleRad: number): IsoPoint {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotatedX = point.x * cos - point.y * sin;
  const rotatedY = point.x * sin + point.y * cos;
  return {
    x: rotatedX,
    y: rotatedY * 0.5
  };
}

function getFootprintOffsets(keys: string[]): TilePoint[] {
  if (keys.length === 0) return [{ x: 0, y: 0 }];
  const tiles = keys.map(parseTileKey);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    minX = Math.min(minX, tile.x);
    minY = Math.min(minY, tile.y);
  }
  return tiles.map(tile => ({ x: tile.x - minX, y: tile.y - minY }));
}

function getFootprintBounds(offsets: TilePoint[]) {
  let maxX = 0;
  let maxY = 0;
  for (const tile of offsets) {
    maxX = Math.max(maxX, tile.x);
    maxY = Math.max(maxY, tile.y);
  }
  return { width: maxX + 1, height: maxY + 1 };
}

export function DevAssetStudio() {
  const [activeTab, setActiveTab] = useState<StudioTab>('image');
  const [pixelPreviewEnabled, setPixelPreviewEnabled] = useState(true);
  const [pixelPreviewSize, setPixelPreviewSize] = useState(4);
  const [windowTick, setWindowTick] = useState(0);

  const [imageEditMode, setImageEditMode] = useState<ImageEditMode>('footprint');
  const [buildingId, setBuildingId] = useState('custom_watchtower');
  const [buildingName, setBuildingName] = useState('Custom Watchtower');
  const [buildingCost, setBuildingCost] = useState(600);
  const [buildingMaxCount, setBuildingMaxCount] = useState(3);
  const [buildingCategory, setBuildingCategory] = useState<'defense' | 'resource' | 'military' | 'other'>('defense');
  const [footprintTiles, setFootprintTiles] = useState<string[]>([
    tileKey(0, 0),
    tileKey(1, 0),
    tileKey(0, 1),
    tileKey(1, 1)
  ]);
  const [blockedTiles, setBlockedTiles] = useState<string[]>([
    tileKey(7, 7),
    tileKey(8, 7),
    tileKey(7, 8)
  ]);
  const [placementOrigin, setPlacementOrigin] = useState<TilePoint>({ x: 10, y: 10 });
  const [hoverTile, setHoverTile] = useState<TilePoint | null>(null);
  const [assetLabel, setAssetLabel] = useState('tower_v1.png');

  const [imageTransform, setImageTransform] = useState<ImageTransform>({
    isoX: 0,
    isoY: -68,
    scale: 1,
    rotationDeg: 0,
    opacity: 1
  });

  const [aimAngleDeg, setAimAngleDeg] = useState(35);
  const [defenseId, setDefenseId] = useState('custom_cannon');
  const [defenseName, setDefenseName] = useState('Custom Cannon');
  const [defenseWidth, setDefenseWidth] = useState(2);
  const [defenseHeight, setDefenseHeight] = useState(2);
  const [defenseRange, setDefenseRange] = useState(8);
  const [defenseDamage, setDefenseDamage] = useState(90);
  const [defenseFireRate, setDefenseFireRate] = useState(2200);
  const [defenseMinRange, setDefenseMinRange] = useState(0);
  const [pivotX, setPivotX] = useState(0);
  const [pivotY, setPivotY] = useState(-8);
  const [muzzleX, setMuzzleX] = useState(34);
  const [muzzleY, setMuzzleY] = useState(-16);
  const [targetDistance, setTargetDistance] = useState(180);
  const [targetHeightOffset, setTargetHeightOffset] = useState(0);

  const [projectile, setProjectile] = useState<ProjectileConfig>({
    travelMs: 820,
    arcHeight: 48,
    radius: 6,
    color: '#f17f2a',
    trailColor: '#ffd3a0',
    splashRadius: 34,
    loop: true
  });

  const [shapes, setShapes] = useState<DefenseShape[]>(defaultDefenseShapes);
  const [selectedShapeId, setSelectedShapeId] = useState<string>('shape_barrel');
  const [projectilePlaying, setProjectilePlaying] = useState(false);
  const [projectileProgress, setProjectileProgress] = useState(0);

  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageSceneBufferRef = useRef<HTMLCanvasElement | null>(null);
  const imagePixelBufferRef = useRef<HTMLCanvasElement | null>(null);
  const defenseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const defenseSceneBufferRef = useRef<HTMLCanvasElement | null>(null);
  const defensePixelBufferRef = useRef<HTMLCanvasElement | null>(null);

  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [loadedImageSize, setLoadedImageSize] = useState({ width: 0, height: 0 });

  const imageDragRef = useRef<{ active: boolean; offsetX: number; offsetY: number }>({
    active: false,
    offsetX: 0,
    offsetY: 0
  });

  const projectileStartRef = useRef(0);

  useEffect(() => {
    const onResize = () => setWindowTick(prev => prev + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!projectilePlaying) return;

    projectileStartRef.current = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const elapsed = now - projectileStartRef.current;
      const nextProgress = elapsed / Math.max(50, projectile.travelMs);

      if (nextProgress >= 1) {
        if (projectile.loop) {
          projectileStartRef.current = now;
          setProjectileProgress(0);
          raf = window.requestAnimationFrame(step);
          return;
        }
        setProjectileProgress(1);
        setProjectilePlaying(false);
        return;
      }

      setProjectileProgress(nextProgress);
      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [projectilePlaying, projectile.travelMs, projectile.loop]);

  const footprintOffsets = useMemo(() => getFootprintOffsets(footprintTiles), [footprintTiles]);
  const footprintBounds = useMemo(() => getFootprintBounds(footprintOffsets), [footprintOffsets]);

  const placedFootprintTiles = useMemo(() => {
    return footprintOffsets.map(tile => ({
      x: placementOrigin.x + tile.x,
      y: placementOrigin.y + tile.y
    }));
  }, [footprintOffsets, placementOrigin]);

  const placementIsValid = useMemo(() => {
    const blockedSet = new Set(blockedTiles);
    for (const tile of placedFootprintTiles) {
      if (tile.x < 0 || tile.y < 0 || tile.x >= STUDIO_MAP_SIZE || tile.y >= STUDIO_MAP_SIZE) {
        return false;
      }
      if (blockedSet.has(tileKey(tile.x, tile.y))) {
        return false;
      }
    }
    return true;
  }, [blockedTiles, placedFootprintTiles]);

  const selectedShape = useMemo(
    () => shapes.find(shape => shape.id === selectedShapeId) ?? null,
    [shapes, selectedShapeId]
  );

  const imageExportPayload = useMemo(() => {
    return {
      tool: 'Image Building Studio',
      building: {
        id: buildingId,
        name: buildingName,
        category: buildingCategory,
        cost: buildingCost,
        maxCount: buildingMaxCount,
        width: footprintBounds.width,
        height: footprintBounds.height,
        footprintTiles: footprintOffsets
      },
      art: {
        mode: 'image',
        assetLabel,
        naturalSize: loadedImageSize,
        transform: imageTransform,
        smoothing: 'linear',
        pixelPreview: {
          enabled: pixelPreviewEnabled,
          pixelSize: pixelPreviewSize
        }
      },
      testPlacement: {
        origin: placementOrigin,
        valid: placementIsValid,
        blockedTiles: blockedTiles.map(parseTileKey)
      }
    };
  }, [
    assetLabel,
    blockedTiles,
    buildingCategory,
    buildingCost,
    buildingId,
    buildingMaxCount,
    buildingName,
    footprintBounds.height,
    footprintBounds.width,
    footprintOffsets,
    imageTransform,
    loadedImageSize,
    pixelPreviewEnabled,
    pixelPreviewSize,
    placementIsValid,
    placementOrigin
  ]);

  const imageDefinitionSnippet = useMemo(() => {
    const id = buildingId || 'new_building';
    return `
${id}: {
  id: '${id}',
  name: '${buildingName}',
  cost: ${Math.max(0, buildingCost)},
  desc: 'Custom building from Dev Asset Studio',
  width: ${footprintBounds.width},
  height: ${footprintBounds.height},
  maxHealth: 1000,
  category: '${buildingCategory}',
  maxCount: ${Math.max(1, buildingMaxCount)},
  maxLevel: 1
}`.trim();
  }, [buildingCategory, buildingCost, buildingId, buildingMaxCount, buildingName, footprintBounds.height, footprintBounds.width]);

  const defenseExportPayload = useMemo(() => {
    return {
      tool: 'Defense Studio',
      defense: {
        id: defenseId,
        name: defenseName,
        footprint: { width: defenseWidth, height: defenseHeight },
        stats: {
          range: defenseRange,
          minRange: defenseMinRange,
          damage: defenseDamage,
          fireRate: defenseFireRate
        }
      },
      render: {
        aimAngleDeg,
        pivot: { x: pivotX, y: pivotY },
        muzzle: { x: muzzleX, y: muzzleY },
        angleModel: 'cos(x), sin(y)*0.5 isometric flatten',
        layers: shapes
      },
      projectile
    };
  }, [
    aimAngleDeg,
    defenseDamage,
    defenseFireRate,
    defenseHeight,
    defenseId,
    defenseMinRange,
    defenseName,
    defenseRange,
    defenseWidth,
    muzzleX,
    muzzleY,
    pivotX,
    pivotY,
    projectile,
    shapes
  ]);

  const defenseRendererSnippet = useMemo(() => {
    const upperId = (defenseId || 'custom_defense').replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    return `
export const ${upperId}_ART = ${JSON.stringify(defenseExportPayload.render, null, 2)};

// In BuildingRenderer: load shape layers and draw with angle-aware transform
// x = cos(angle) * localX - sin(angle) * localY
// y = (sin(angle) * localX + cos(angle) * localY) * 0.5
`.trim();
  }, [defenseExportPayload.render, defenseId]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn('Clipboard write failed:', error);
    }
  }, []);

  const loadImageFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== 'string') return;

      const image = new Image();
      image.onload = () => {
        loadedImageRef.current = image;
        setLoadedImageSize({ width: image.width, height: image.height });
        setAssetLabel(file.name);
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  const getImageCanvasView = useCallback((canvasWidth: number, canvasHeight: number) => {
    return {
      originX: canvasWidth * 0.5,
      originY: Math.max(72, canvasHeight * 0.15)
    };
  }, []);

  const screenToTile = useCallback((x: number, y: number, canvasWidth: number, canvasHeight: number) => {
    const view = getImageCanvasView(canvasWidth, canvasHeight);
    const cart = toCart(x - view.originX, y - view.originY);
    return {
      x: Math.floor(cart.x),
      y: Math.floor(cart.y)
    };
  }, [getImageCanvasView]);

  const isPointerInsideImage = useCallback((
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const image = loadedImageRef.current;
    if (!image) return false;

    const view = getImageCanvasView(canvasWidth, canvasHeight);
    const centerX = view.originX + imageTransform.isoX;
    const centerY = view.originY + imageTransform.isoY;

    const dx = x - centerX;
    const dy = y - centerY;

    const rad = (-imageTransform.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfW = (image.width * imageTransform.scale) * 0.5;
    const halfH = (image.height * imageTransform.scale) * 0.5;

    return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
  }, [getImageCanvasView, imageTransform.isoX, imageTransform.isoY, imageTransform.rotationDeg, imageTransform.scale]);

  const handleImageCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const tile = screenToTile(x, y, rect.width, rect.height);

    if (imageEditMode === 'image' && isPointerInsideImage(x, y, rect.width, rect.height)) {
      const view = getImageCanvasView(rect.width, rect.height);
      imageDragRef.current = {
        active: true,
        offsetX: x - (view.originX + imageTransform.isoX),
        offsetY: y - (view.originY + imageTransform.isoY)
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (tile.x < 0 || tile.y < 0 || tile.x >= STUDIO_MAP_SIZE || tile.y >= STUDIO_MAP_SIZE) {
      return;
    }

    const key = tileKey(tile.x, tile.y);

    if (imageEditMode === 'footprint') {
      setFootprintTiles(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          if (next.size === 1) return prev;
          next.delete(key);
        } else {
          next.add(key);
        }
        return Array.from(next);
      });
    }

    if (imageEditMode === 'blockers') {
      setBlockedTiles(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return Array.from(next);
      });
    }

    if (imageEditMode === 'placement') {
      setPlacementOrigin(tile);
    }
  }, [getImageCanvasView, imageEditMode, imageTransform.isoX, imageTransform.isoY, isPointerInsideImage, screenToTile]);

  const handleImageCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (imageDragRef.current.active) {
      const view = getImageCanvasView(rect.width, rect.height);
      setImageTransform(prev => ({
        ...prev,
        isoX: x - view.originX - imageDragRef.current.offsetX,
        isoY: y - view.originY - imageDragRef.current.offsetY
      }));
      return;
    }

    const tile = screenToTile(x, y, rect.width, rect.height);
    if (tile.x < 0 || tile.y < 0 || tile.x >= STUDIO_MAP_SIZE || tile.y >= STUDIO_MAP_SIZE) {
      setHoverTile(null);
      return;
    }
    setHoverTile(tile);
  }, [getImageCanvasView, screenToTile]);

  const handleImageCanvasPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    if (!imageDragRef.current.active) return;

    imageDragRef.current.active = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, dpr } = resizeCanvas(canvas);
    const sceneBuffer = ensureBuffer(imageSceneBufferRef, width, height, dpr);
    const sceneCtx = sceneBuffer.getContext('2d');
    if (!sceneCtx) return;

    sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sceneCtx.clearRect(0, 0, width, height);

    sceneCtx.fillStyle = '#eff5ff';
    sceneCtx.fillRect(0, 0, width, height);

    const view = getImageCanvasView(width, height);

    for (let x = 0; x < STUDIO_MAP_SIZE; x += 1) {
      for (let y = 0; y < STUDIO_MAP_SIZE; y += 1) {
        const pTop = toIso(x, y);
        const pRight = toIso(x + 1, y);
        const pBottom = toIso(x + 1, y + 1);
        const pLeft = toIso(x, y + 1);

        sceneCtx.beginPath();
        sceneCtx.moveTo(view.originX + pTop.x, view.originY + pTop.y);
        sceneCtx.lineTo(view.originX + pRight.x, view.originY + pRight.y);
        sceneCtx.lineTo(view.originX + pBottom.x, view.originY + pBottom.y);
        sceneCtx.lineTo(view.originX + pLeft.x, view.originY + pLeft.y);
        sceneCtx.closePath();

        const checker = (x + y) % 2 === 0;
        sceneCtx.fillStyle = checker ? '#dbead0' : '#d3e4c8';
        sceneCtx.fill();
        sceneCtx.strokeStyle = 'rgba(17, 38, 24, 0.16)';
        sceneCtx.lineWidth = 1;
        sceneCtx.stroke();
      }
    }

    const footprintSet = new Set(footprintTiles);
    const blockedSet = new Set(blockedTiles);

    const drawTileFill = (tile: TilePoint, fill: string) => {
      const pTop = toIso(tile.x, tile.y);
      const pRight = toIso(tile.x + 1, tile.y);
      const pBottom = toIso(tile.x + 1, tile.y + 1);
      const pLeft = toIso(tile.x, tile.y + 1);
      sceneCtx.beginPath();
      sceneCtx.moveTo(view.originX + pTop.x, view.originY + pTop.y);
      sceneCtx.lineTo(view.originX + pRight.x, view.originY + pRight.y);
      sceneCtx.lineTo(view.originX + pBottom.x, view.originY + pBottom.y);
      sceneCtx.lineTo(view.originX + pLeft.x, view.originY + pLeft.y);
      sceneCtx.closePath();
      sceneCtx.fillStyle = fill;
      sceneCtx.fill();
    };

    for (const key of blockedSet) {
      const tile = parseTileKey(key);
      drawTileFill(tile, 'rgba(186, 36, 36, 0.45)');
    }

    for (const key of footprintSet) {
      const tile = parseTileKey(key);
      drawTileFill(tile, 'rgba(38, 87, 255, 0.32)');
    }

    if (hoverTile && imageEditMode !== 'image') {
      drawTileFill(hoverTile, 'rgba(255, 255, 255, 0.3)');
    }

    for (const tile of placedFootprintTiles) {
      const fill = placementIsValid ? 'rgba(34, 179, 75, 0.32)' : 'rgba(222, 32, 32, 0.35)';
      drawTileFill(tile, fill);
    }

    sceneCtx.strokeStyle = '#2f5bff';
    sceneCtx.lineWidth = 3;
    for (const key of footprintSet) {
      const tile = parseTileKey(key);
      const top = toIso(tile.x, tile.y);
      const right = toIso(tile.x + 1, tile.y);
      const bottom = toIso(tile.x + 1, tile.y + 1);
      const left = toIso(tile.x, tile.y + 1);

      const neighbors = {
        north: footprintSet.has(tileKey(tile.x, tile.y - 1)),
        east: footprintSet.has(tileKey(tile.x + 1, tile.y)),
        south: footprintSet.has(tileKey(tile.x, tile.y + 1)),
        west: footprintSet.has(tileKey(tile.x - 1, tile.y))
      };

      const drawEdge = (from: IsoPoint, to: IsoPoint) => {
        sceneCtx.beginPath();
        sceneCtx.moveTo(view.originX + from.x, view.originY + from.y);
        sceneCtx.lineTo(view.originX + to.x, view.originY + to.y);
        sceneCtx.stroke();
      };

      if (!neighbors.north) drawEdge(top, right);
      if (!neighbors.east) drawEdge(right, bottom);
      if (!neighbors.south) drawEdge(bottom, left);
      if (!neighbors.west) drawEdge(left, top);
    }

    const image = loadedImageRef.current;
    if (image) {
      sceneCtx.save();
      sceneCtx.translate(view.originX + imageTransform.isoX, view.originY + imageTransform.isoY);
      sceneCtx.rotate((imageTransform.rotationDeg * Math.PI) / 180);
      sceneCtx.globalAlpha = clamp(imageTransform.opacity, 0.1, 1);
      sceneCtx.imageSmoothingEnabled = true;
      sceneCtx.drawImage(
        image,
        -0.5 * image.width * imageTransform.scale,
        -0.5 * image.height * imageTransform.scale,
        image.width * imageTransform.scale,
        image.height * imageTransform.scale
      );
      sceneCtx.restore();
    }

    sceneCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    sceneCtx.fillRect(12, 12, 290, 72);
    sceneCtx.fillStyle = '#ffffff';
    sceneCtx.font = '12px monospace';
    sceneCtx.fillText(`Mode: ${imageEditMode.toUpperCase()}`, 20, 34);
    sceneCtx.fillText(`Footprint: ${footprintBounds.width} x ${footprintBounds.height}`, 20, 54);
    sceneCtx.fillText(`Placement: ${placementIsValid ? 'VALID' : 'BLOCKED'}`, 20, 74);

    presentWithPixelation(
      ctx,
      sceneBuffer,
      width,
      height,
      dpr,
      pixelPreviewEnabled,
      pixelPreviewSize,
      imagePixelBufferRef
    );
  }, [
    blockedTiles,
    footprintBounds.height,
    footprintBounds.width,
    footprintTiles,
    getImageCanvasView,
    hoverTile,
    imageEditMode,
    imageTransform.isoX,
    imageTransform.isoY,
    imageTransform.opacity,
    imageTransform.rotationDeg,
    imageTransform.scale,
    placedFootprintTiles,
    pixelPreviewEnabled,
    pixelPreviewSize,
    placementIsValid,
    windowTick
  ]);

  useEffect(() => {
    const canvas = defenseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, dpr } = resizeCanvas(canvas);
    const sceneBuffer = ensureBuffer(defenseSceneBufferRef, width, height, dpr);
    const sceneCtx = sceneBuffer.getContext('2d');
    if (!sceneCtx) return;

    sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sceneCtx.clearRect(0, 0, width, height);
    sceneCtx.fillStyle = '#f3f5fb';
    sceneCtx.fillRect(0, 0, width, height);

    const centerX = width * 0.5;
    const centerY = height * 0.52;

    for (let gx = -6; gx <= 6; gx += 1) {
      for (let gy = -6; gy <= 6; gy += 1) {
        const top = toIso(gx, gy);
        const right = toIso(gx + 1, gy);
        const bottom = toIso(gx + 1, gy + 1);
        const left = toIso(gx, gy + 1);

        sceneCtx.beginPath();
        sceneCtx.moveTo(centerX + top.x, centerY + top.y);
        sceneCtx.lineTo(centerX + right.x, centerY + right.y);
        sceneCtx.lineTo(centerX + bottom.x, centerY + bottom.y);
        sceneCtx.lineTo(centerX + left.x, centerY + left.y);
        sceneCtx.closePath();

        sceneCtx.fillStyle = (gx + gy) % 2 === 0 ? '#e7e9f0' : '#dfe2ea';
        sceneCtx.fill();
        sceneCtx.strokeStyle = 'rgba(44, 51, 71, 0.12)';
        sceneCtx.stroke();
      }
    }

    const halfW = defenseWidth * 0.5;
    const halfH = defenseHeight * 0.5;
    const footprintCorners = [
      toIso(-halfW, -halfH),
      toIso(halfW, -halfH),
      toIso(halfW, halfH),
      toIso(-halfW, halfH)
    ];

    sceneCtx.beginPath();
    sceneCtx.moveTo(centerX + footprintCorners[0].x, centerY + footprintCorners[0].y);
    for (let i = 1; i < footprintCorners.length; i += 1) {
      sceneCtx.lineTo(centerX + footprintCorners[i].x, centerY + footprintCorners[i].y);
    }
    sceneCtx.closePath();
    sceneCtx.fillStyle = 'rgba(60, 78, 112, 0.38)';
    sceneCtx.fill();
    sceneCtx.strokeStyle = '#31456e';
    sceneCtx.lineWidth = 2;
    sceneCtx.stroke();

    const angleRad = (aimAngleDeg * Math.PI) / 180;

    const pivotScreen = {
      x: centerX + pivotX,
      y: centerY + pivotY
    };

    const muzzleLocal = transformTurretPoint({ x: muzzleX, y: muzzleY }, angleRad);
    const muzzleScreen = {
      x: pivotScreen.x + muzzleLocal.x,
      y: pivotScreen.y + muzzleLocal.y
    };

    const targetScreen = {
      x: pivotScreen.x + Math.cos(angleRad) * targetDistance,
      y: pivotScreen.y + Math.sin(angleRad) * targetDistance * 0.5 + targetHeightOffset
    };

    const drawShape = (shape: DefenseShape, position: IsoPoint, theta: number) => {
      const alpha = clamp(shape.alpha, 0, 1);
      const strokeWidth = Math.max(0, shape.strokeWidth);

      const mapPoint = (point: IsoPoint) => {
        const withShapeRot = rotatePoint(point, shape.rotationDeg);
        if (shape.layer === 'turret' && shape.angleAware) {
          const rotated = transformTurretPoint(withShapeRot, theta);
          return {
            x: position.x + rotated.x,
            y: position.y + rotated.y
          };
        }
        return {
          x: position.x + withShapeRot.x,
          y: position.y + withShapeRot.y
        };
      };

      if (shape.kind === 'rect') {
        const halfShapeW = shape.width * 0.5;
        const halfShapeH = shape.height * 0.5;
        const corners = [
          mapPoint({ x: -halfShapeW + shape.x, y: -halfShapeH + shape.y }),
          mapPoint({ x: halfShapeW + shape.x, y: -halfShapeH + shape.y }),
          mapPoint({ x: halfShapeW + shape.x, y: halfShapeH + shape.y }),
          mapPoint({ x: -halfShapeW + shape.x, y: halfShapeH + shape.y })
        ];

        sceneCtx.beginPath();
        sceneCtx.moveTo(corners[0].x, corners[0].y);
        sceneCtx.lineTo(corners[1].x, corners[1].y);
        sceneCtx.lineTo(corners[2].x, corners[2].y);
        sceneCtx.lineTo(corners[3].x, corners[3].y);
        sceneCtx.closePath();
        sceneCtx.fillStyle = shape.fill;
        sceneCtx.globalAlpha = alpha;
        sceneCtx.fill();
        if (strokeWidth > 0) {
          sceneCtx.strokeStyle = shape.stroke;
          sceneCtx.lineWidth = strokeWidth;
          sceneCtx.stroke();
        }
        sceneCtx.globalAlpha = 1;
        return;
      }

      if (shape.kind === 'circle') {
        const center = mapPoint({ x: shape.x, y: shape.y });
        const radius = Math.max(1, shape.radius);
        const ellipseYScale = shape.layer === 'turret' && shape.angleAware ? 0.7 : 1;
        sceneCtx.beginPath();
        sceneCtx.ellipse(center.x, center.y, radius, radius * ellipseYScale, 0, 0, Math.PI * 2);
        sceneCtx.fillStyle = shape.fill;
        sceneCtx.globalAlpha = alpha;
        sceneCtx.fill();
        if (strokeWidth > 0) {
          sceneCtx.strokeStyle = shape.stroke;
          sceneCtx.lineWidth = strokeWidth;
          sceneCtx.stroke();
        }
        sceneCtx.globalAlpha = 1;
        return;
      }

      const start = mapPoint({ x: shape.x, y: shape.y });
      const end = mapPoint({ x: shape.x2, y: shape.y2 });
      sceneCtx.beginPath();
      sceneCtx.moveTo(start.x, start.y);
      sceneCtx.lineTo(end.x, end.y);
      sceneCtx.strokeStyle = shape.stroke;
      sceneCtx.globalAlpha = alpha;
      sceneCtx.lineWidth = Math.max(1, strokeWidth);
      sceneCtx.lineCap = 'round';
      sceneCtx.stroke();
      sceneCtx.globalAlpha = 1;
      sceneCtx.lineCap = 'butt';
    };

    const drawLayer = (layer: ShapeLayer) => {
      shapes
        .filter(shape => shape.layer === layer)
        .forEach(shape => {
          const anchor = layer === 'turret' ? pivotScreen : layer === 'projectile' ? muzzleScreen : { x: centerX, y: centerY };
          drawShape(shape, anchor, angleRad);
        });
    };

    drawLayer('base');
    drawLayer('turret');

    sceneCtx.strokeStyle = 'rgba(37, 73, 188, 0.75)';
    sceneCtx.lineWidth = 2;
    sceneCtx.setLineDash([5, 4]);
    sceneCtx.beginPath();
    sceneCtx.moveTo(muzzleScreen.x, muzzleScreen.y);
    sceneCtx.lineTo(targetScreen.x, targetScreen.y);
    sceneCtx.stroke();
    sceneCtx.setLineDash([]);

    const projectileX = muzzleScreen.x + (targetScreen.x - muzzleScreen.x) * projectileProgress;
    const projectileY = muzzleScreen.y + (targetScreen.y - muzzleScreen.y) * projectileProgress - Math.sin(projectileProgress * Math.PI) * projectile.arcHeight;

    if (projectilePlaying || projectileProgress > 0) {
      sceneCtx.beginPath();
      sceneCtx.fillStyle = projectile.trailColor;
      sceneCtx.globalAlpha = 0.28;
      sceneCtx.arc(projectileX, projectileY, projectile.radius * 2.3, 0, Math.PI * 2);
      sceneCtx.fill();
      sceneCtx.globalAlpha = 1;

      sceneCtx.beginPath();
      sceneCtx.fillStyle = projectile.color;
      sceneCtx.arc(projectileX, projectileY, projectile.radius, 0, Math.PI * 2);
      sceneCtx.fill();

      sceneCtx.beginPath();
      sceneCtx.strokeStyle = 'rgba(218, 70, 70, 0.48)';
      sceneCtx.lineWidth = 2;
      sceneCtx.arc(targetScreen.x, targetScreen.y, projectile.splashRadius, 0, Math.PI * 2);
      sceneCtx.stroke();
    }

    drawLayer('projectile');

    sceneCtx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    sceneCtx.fillRect(12, 12, 350, 90);
    sceneCtx.fillStyle = '#ffffff';
    sceneCtx.font = '12px monospace';
    sceneCtx.fillText(`Angle: ${aimAngleDeg.toFixed(1)} deg`, 20, 34);
    sceneCtx.fillText(`Muzzle: (${Math.round(muzzleScreen.x - centerX)}, ${Math.round(muzzleScreen.y - centerY)})`, 20, 54);
    sceneCtx.fillText(`Projectile: ${(projectileProgress * 100).toFixed(0)}%`, 20, 74);
    sceneCtx.fillText(`Pixel Preview: ${pixelPreviewEnabled ? `ON (${pixelPreviewSize}px)` : 'OFF'}`, 20, 94);

    presentWithPixelation(
      ctx,
      sceneBuffer,
      width,
      height,
      dpr,
      pixelPreviewEnabled,
      pixelPreviewSize,
      defensePixelBufferRef
    );
  }, [
    aimAngleDeg,
    defenseHeight,
    defenseWidth,
    muzzleX,
    muzzleY,
    pivotX,
    pivotY,
    pixelPreviewEnabled,
    pixelPreviewSize,
    projectile,
    projectilePlaying,
    projectileProgress,
    shapes,
    targetDistance,
    targetHeightOffset,
    windowTick
  ]);

  const addShape = useCallback((kind: ShapeKind, layer: ShapeLayer) => {
    const id = `shape_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const shape: DefenseShape = {
      id,
      name: `${layer}_${kind}`,
      kind,
      layer,
      x: 0,
      y: 0,
      width: 28,
      height: 18,
      radius: 8,
      x2: 24,
      y2: 0,
      rotationDeg: 0,
      fill: '#808080',
      stroke: '#f5f5f5',
      strokeWidth: 2,
      alpha: 1,
      angleAware: layer !== 'base'
    };
    setShapes(prev => [...prev, shape]);
    setSelectedShapeId(id);
  }, []);

  const updateSelectedShape = useCallback(function <K extends keyof DefenseShape>(key: K, value: DefenseShape[K]) {
    if (!selectedShapeId) return;
    setShapes(prev => prev.map(shape => (shape.id === selectedShapeId ? { ...shape, [key]: value } : shape)));
  }, [selectedShapeId]);

  return (
    <div className="dev-studio-root">
      <header className="dev-studio-header">
        <div>
          <h1>Dev Asset Studio</h1>
          <p>Image buildings + angle-aware vector defenses with export payloads.</p>
        </div>
        <div className="dev-studio-header-actions">
          <label className="inline-switch">
            <input
              type="checkbox"
              checked={pixelPreviewEnabled}
              onChange={event => setPixelPreviewEnabled(event.target.checked)}
            />
            Pixelation Overlay Preview
          </label>
          <label className="compact-field">
            Pixel Size
            <input
              type="range"
              min={2}
              max={12}
              value={pixelPreviewSize}
              onChange={event => setPixelPreviewSize(Number(event.target.value))}
              disabled={!pixelPreviewEnabled}
            />
            <span>{pixelPreviewSize}px</span>
          </label>
        </div>
      </header>

      <div className="studio-tabs">
        <button
          className={activeTab === 'image' ? 'active' : ''}
          onClick={() => setActiveTab('image')}
          type="button"
        >
          Image Building Studio
        </button>
        <button
          className={activeTab === 'defense' ? 'active' : ''}
          onClick={() => setActiveTab('defense')}
          type="button"
        >
          Defense Studio
        </button>
      </div>

      {activeTab === 'image' && (
        <div className="studio-layout">
          <section className="studio-canvas-panel">
            <canvas
              ref={imageCanvasRef}
              className="studio-canvas"
              onPointerDown={handleImageCanvasPointerDown}
              onPointerMove={handleImageCanvasPointerMove}
              onPointerUp={handleImageCanvasPointerUp}
              onPointerCancel={handleImageCanvasPointerUp}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                loadImageFile(event.dataTransfer.files?.[0] ?? null);
              }}
            />
          </section>

          <aside className="studio-sidebar">
            <div className="panel-block">
              <h2>Editor Mode</h2>
              <div className="button-row four">
                {(['footprint', 'blockers', 'placement', 'image'] as ImageEditMode[]).map(mode => (
                  <button
                    key={mode}
                    className={imageEditMode === mode ? 'active' : ''}
                    onClick={() => setImageEditMode(mode)}
                    type="button"
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-block">
              <h2>Building Data</h2>
              <label>
                ID
                <input value={buildingId} onChange={event => setBuildingId(event.target.value)} />
              </label>
              <label>
                Name
                <input value={buildingName} onChange={event => setBuildingName(event.target.value)} />
              </label>
              <div className="grid-two">
                <label>
                  Cost
                  <input
                    type="number"
                    value={buildingCost}
                    onChange={event => setBuildingCost(Number(event.target.value))}
                  />
                </label>
                <label>
                  Max Count
                  <input
                    type="number"
                    value={buildingMaxCount}
                    onChange={event => setBuildingMaxCount(Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Category
                <select
                  value={buildingCategory}
                  onChange={event => setBuildingCategory(event.target.value as typeof buildingCategory)}
                >
                  <option value="defense">defense</option>
                  <option value="resource">resource</option>
                  <option value="military">military</option>
                  <option value="other">other</option>
                </select>
              </label>
              <div className="stat-line">Footprint tiles: {footprintTiles.length}</div>
              <div className="stat-line">Bounds: {footprintBounds.width} x {footprintBounds.height}</div>
              <div className={`stat-line ${placementIsValid ? 'ok' : 'warn'}`}>
                Placement test: {placementIsValid ? 'VALID' : 'BLOCKED'}
              </div>
            </div>

            <div className="panel-block">
              <h2>Image Asset</h2>
              <label className="file-input">
                Load Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={event => loadImageFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label>
                Asset Label
                <input value={assetLabel} onChange={event => setAssetLabel(event.target.value)} />
              </label>
              <div className="grid-two">
                <label>
                  Iso X
                  <input
                    type="number"
                    value={Math.round(imageTransform.isoX)}
                    onChange={event => setImageTransform(prev => ({ ...prev, isoX: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Iso Y
                  <input
                    type="number"
                    value={Math.round(imageTransform.isoY)}
                    onChange={event => setImageTransform(prev => ({ ...prev, isoY: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Scale
                  <input
                    type="number"
                    step="0.05"
                    value={imageTransform.scale}
                    onChange={event => setImageTransform(prev => ({ ...prev, scale: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Rotation
                  <input
                    type="number"
                    step="1"
                    value={imageTransform.rotationDeg}
                    onChange={event => setImageTransform(prev => ({ ...prev, rotationDeg: Number(event.target.value) }))}
                  />
                </label>
              </div>
              <label>
                Opacity
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={imageTransform.opacity}
                  onChange={event => setImageTransform(prev => ({ ...prev, opacity: Number(event.target.value) }))}
                />
              </label>
              <div className="stat-line">Drag image directly in canvas when mode is <code>image</code>.</div>
            </div>

            <div className="panel-block">
              <h2>Export</h2>
              <div className="button-row">
                <button type="button" onClick={() => copyText(JSON.stringify(imageExportPayload, null, 2))}>Copy JSON</button>
                <button type="button" onClick={() => copyText(imageDefinitionSnippet)}>Copy Definition Snippet</button>
              </div>
              <textarea readOnly value={JSON.stringify(imageExportPayload, null, 2)} rows={11} />
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'defense' && (
        <div className="studio-layout">
          <section className="studio-canvas-panel">
            <canvas ref={defenseCanvasRef} className="studio-canvas" />
          </section>

          <aside className="studio-sidebar">
            <div className="panel-block">
              <h2>Defense Core</h2>
              <label>
                ID
                <input value={defenseId} onChange={event => setDefenseId(event.target.value)} />
              </label>
              <label>
                Name
                <input value={defenseName} onChange={event => setDefenseName(event.target.value)} />
              </label>
              <div className="grid-two">
                <label>
                  Footprint W
                  <input type="number" value={defenseWidth} onChange={event => setDefenseWidth(Number(event.target.value))} />
                </label>
                <label>
                  Footprint H
                  <input type="number" value={defenseHeight} onChange={event => setDefenseHeight(Number(event.target.value))} />
                </label>
                <label>
                  Range
                  <input type="number" value={defenseRange} onChange={event => setDefenseRange(Number(event.target.value))} />
                </label>
                <label>
                  Min Range
                  <input type="number" value={defenseMinRange} onChange={event => setDefenseMinRange(Number(event.target.value))} />
                </label>
                <label>
                  Damage
                  <input type="number" value={defenseDamage} onChange={event => setDefenseDamage(Number(event.target.value))} />
                </label>
                <label>
                  Fire Rate (ms)
                  <input type="number" value={defenseFireRate} onChange={event => setDefenseFireRate(Number(event.target.value))} />
                </label>
              </div>
            </div>

            <div className="panel-block">
              <h2>Aim + Projectile</h2>
              <label>
                Aim Angle ({aimAngleDeg.toFixed(1)} deg)
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={aimAngleDeg}
                  onChange={event => setAimAngleDeg(Number(event.target.value))}
                />
              </label>
              <div className="grid-two">
                <label>
                  Pivot X
                  <input type="number" value={pivotX} onChange={event => setPivotX(Number(event.target.value))} />
                </label>
                <label>
                  Pivot Y
                  <input type="number" value={pivotY} onChange={event => setPivotY(Number(event.target.value))} />
                </label>
                <label>
                  Muzzle X
                  <input type="number" value={muzzleX} onChange={event => setMuzzleX(Number(event.target.value))} />
                </label>
                <label>
                  Muzzle Y
                  <input type="number" value={muzzleY} onChange={event => setMuzzleY(Number(event.target.value))} />
                </label>
                <label>
                  Target Distance
                  <input type="number" value={targetDistance} onChange={event => setTargetDistance(Number(event.target.value))} />
                </label>
                <label>
                  Target Height
                  <input type="number" value={targetHeightOffset} onChange={event => setTargetHeightOffset(Number(event.target.value))} />
                </label>
              </div>
              <div className="grid-two">
                <label>
                  Travel (ms)
                  <input
                    type="number"
                    value={projectile.travelMs}
                    onChange={event => setProjectile(prev => ({ ...prev, travelMs: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Arc Height
                  <input
                    type="number"
                    value={projectile.arcHeight}
                    onChange={event => setProjectile(prev => ({ ...prev, arcHeight: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Radius
                  <input
                    type="number"
                    value={projectile.radius}
                    onChange={event => setProjectile(prev => ({ ...prev, radius: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  Splash Radius
                  <input
                    type="number"
                    value={projectile.splashRadius}
                    onChange={event => setProjectile(prev => ({ ...prev, splashRadius: Number(event.target.value) }))}
                  />
                </label>
              </div>
              <div className="grid-two">
                <label>
                  Projectile Color
                  <input
                    type="color"
                    value={projectile.color}
                    onChange={event => setProjectile(prev => ({ ...prev, color: event.target.value }))}
                  />
                </label>
                <label>
                  Trail Color
                  <input
                    type="color"
                    value={projectile.trailColor}
                    onChange={event => setProjectile(prev => ({ ...prev, trailColor: event.target.value }))}
                  />
                </label>
              </div>
              <label className="inline-switch">
                <input
                  type="checkbox"
                  checked={projectile.loop}
                  onChange={event => setProjectile(prev => ({ ...prev, loop: event.target.checked }))}
                />
                Loop Simulation
              </label>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    setProjectileProgress(0);
                    setProjectilePlaying(true);
                  }}
                >
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectilePlaying(false);
                    setProjectileProgress(0);
                  }}
                >
                  Stop
                </button>
              </div>
            </div>

            <div className="panel-block">
              <h2>Vector Layers</h2>
              <div className="button-row">
                <button type="button" onClick={() => addShape('rect', 'base')}>+ Base Rect</button>
                <button type="button" onClick={() => addShape('circle', 'turret')}>+ Turret Circle</button>
                <button type="button" onClick={() => addShape('line', 'turret')}>+ Turret Line</button>
              </div>
              <div className="shape-list">
                {shapes.map(shape => (
                  <button
                    key={shape.id}
                    type="button"
                    className={shape.id === selectedShapeId ? 'active' : ''}
                    onClick={() => setSelectedShapeId(shape.id)}
                  >
                    {shape.name} [{shape.layer}:{shape.kind}]
                  </button>
                ))}
              </div>

              {selectedShape && (
                <div className="shape-editor">
                  <label>
                    Name
                    <input value={selectedShape.name} onChange={event => updateSelectedShape('name', event.target.value)} />
                  </label>
                  <div className="grid-two">
                    <label>
                      Kind
                      <select value={selectedShape.kind} onChange={event => updateSelectedShape('kind', event.target.value as ShapeKind)}>
                        <option value="rect">rect</option>
                        <option value="circle">circle</option>
                        <option value="line">line</option>
                      </select>
                    </label>
                    <label>
                      Layer
                      <select value={selectedShape.layer} onChange={event => updateSelectedShape('layer', event.target.value as ShapeLayer)}>
                        <option value="base">base</option>
                        <option value="turret">turret</option>
                        <option value="projectile">projectile</option>
                      </select>
                    </label>
                    <label>
                      X
                      <input type="number" value={selectedShape.x} onChange={event => updateSelectedShape('x', Number(event.target.value))} />
                    </label>
                    <label>
                      Y
                      <input type="number" value={selectedShape.y} onChange={event => updateSelectedShape('y', Number(event.target.value))} />
                    </label>
                    <label>
                      Width
                      <input type="number" value={selectedShape.width} onChange={event => updateSelectedShape('width', Number(event.target.value))} />
                    </label>
                    <label>
                      Height
                      <input type="number" value={selectedShape.height} onChange={event => updateSelectedShape('height', Number(event.target.value))} />
                    </label>
                    <label>
                      Radius
                      <input type="number" value={selectedShape.radius} onChange={event => updateSelectedShape('radius', Number(event.target.value))} />
                    </label>
                    <label>
                      Rotation
                      <input type="number" value={selectedShape.rotationDeg} onChange={event => updateSelectedShape('rotationDeg', Number(event.target.value))} />
                    </label>
                    <label>
                      X2 (line)
                      <input type="number" value={selectedShape.x2} onChange={event => updateSelectedShape('x2', Number(event.target.value))} />
                    </label>
                    <label>
                      Y2 (line)
                      <input type="number" value={selectedShape.y2} onChange={event => updateSelectedShape('y2', Number(event.target.value))} />
                    </label>
                    <label>
                      Fill
                      <input type="color" value={selectedShape.fill} onChange={event => updateSelectedShape('fill', event.target.value)} />
                    </label>
                    <label>
                      Stroke
                      <input type="color" value={selectedShape.stroke} onChange={event => updateSelectedShape('stroke', event.target.value)} />
                    </label>
                    <label>
                      Stroke Width
                      <input type="number" value={selectedShape.strokeWidth} onChange={event => updateSelectedShape('strokeWidth', Number(event.target.value))} />
                    </label>
                    <label>
                      Alpha
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        value={selectedShape.alpha}
                        onChange={event => updateSelectedShape('alpha', Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <label className="inline-switch">
                    <input
                      type="checkbox"
                      checked={selectedShape.angleAware}
                      onChange={event => updateSelectedShape('angleAware', event.target.checked)}
                    />
                    Angle Aware (turret transform)
                  </label>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setShapes(prev => prev.filter(shape => shape.id !== selectedShape.id));
                      const remaining = shapes.filter(shape => shape.id !== selectedShape.id);
                      setSelectedShapeId(remaining[0]?.id ?? '');
                    }}
                  >
                    Delete Layer
                  </button>
                </div>
              )}
            </div>

            <div className="panel-block">
              <h2>Export</h2>
              <div className="button-row">
                <button type="button" onClick={() => copyText(JSON.stringify(defenseExportPayload, null, 2))}>Copy JSON</button>
                <button type="button" onClick={() => copyText(defenseRendererSnippet)}>Copy Renderer Snippet</button>
              </div>
              <textarea readOnly value={JSON.stringify(defenseExportPayload, null, 2)} rows={11} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
