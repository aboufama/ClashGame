import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import './DevAssetStudio.css';

const ISO_TILE_WIDTH = 64;
const ISO_TILE_HEIGHT = 32;
const ISO_HALF_W = ISO_TILE_WIDTH * 0.5;
const ISO_HALF_H = ISO_TILE_HEIGHT * 0.5;
const STUDIO_MAP_SIZE = 25;
const GAME_PIXEL_SIZE = 1.5;

type StudioToolMode = 'footprint' | 'image';

type IsoPoint = { x: number; y: number };
type TilePoint = { x: number; y: number };

interface ImageTransform {
  isoX: number;
  isoY: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
}

interface PointOfInterest {
  id: string;
  name: string;
  localX: number;
  localY: number;
  color: string;
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
  pixelSize: number,
  pixelBufferRef: MutableRefObject<HTMLCanvasElement | null>
) {
  destination.setTransform(dpr, 0, 0, dpr, 0, 0);
  destination.clearRect(0, 0, width, height);

  if (pixelSize <= 1) {
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

function getIsoBoundsFromTiles(tiles: TilePoint[]) {
  if (tiles.length === 0) {
    return {
      minX: -ISO_HALF_W,
      maxX: ISO_HALF_W,
      minY: 0,
      maxY: ISO_TILE_HEIGHT,
      width: ISO_TILE_WIDTH,
      height: ISO_TILE_HEIGHT
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const tile of tiles) {
    const corners = [
      toIso(tile.x, tile.y),
      toIso(tile.x + 1, tile.y),
      toIso(tile.x + 1, tile.y + 1),
      toIso(tile.x, tile.y + 1)
    ];

    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function formatPointValue(value: number) {
  return Number(value.toFixed(2));
}

export function DevAssetStudio() {
  const [windowTick, setWindowTick] = useState(0);

  const [toolMode, setToolMode] = useState<StudioToolMode>('footprint');
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
  const [hoverTile, setHoverTile] = useState<TilePoint | null>(null);

  const [assetLabel, setAssetLabel] = useState('tower_v1.png');
  const [autoFitImageWidth, setAutoFitImageWidth] = useState(true);
  const [imageTransform, setImageTransform] = useState<ImageTransform>({
    isoX: 0,
    isoY: -68,
    scale: 1,
    rotationDeg: 0,
    opacity: 1
  });

  const [pointsOfInterest, setPointsOfInterest] = useState<PointOfInterest[]>([]);
  const [selectedPoiId, setSelectedPoiId] = useState('');
  const [nextPoiName, setNextPoiName] = useState('new_poi');

  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageSceneBufferRef = useRef<HTMLCanvasElement | null>(null);
  const imagePixelBufferRef = useRef<HTMLCanvasElement | null>(null);

  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [loadedImageSize, setLoadedImageSize] = useState({ width: 0, height: 0 });

  const imageDragRef = useRef<{ active: boolean; offsetX: number; offsetY: number }>({
    active: false,
    offsetX: 0,
    offsetY: 0
  });

  const poiDragRef = useRef<{ active: boolean; poiId: string | null }>({
    active: false,
    poiId: null
  });
  const footprintDragRef = useRef<{ active: boolean; start: TilePoint | null }>({
    active: false,
    start: null
  });

  useEffect(() => {
    const onResize = () => setWindowTick(prev => prev + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const footprintOffsets = useMemo(() => getFootprintOffsets(footprintTiles), [footprintTiles]);
  const footprintBounds = useMemo(() => getFootprintBounds(footprintOffsets), [footprintOffsets]);
  // Horizontal span from the left edge of the leftmost tile to the right edge of the rightmost tile.
  const footprintPixelWidth = useMemo(
    () => Math.max(ISO_TILE_WIDTH, (footprintBounds.width + footprintBounds.height) * ISO_HALF_W),
    [footprintBounds.height, footprintBounds.width]
  );

  const selectedPoi = useMemo(
    () => pointsOfInterest.find(point => point.id === selectedPoiId) ?? null,
    [pointsOfInterest, selectedPoiId]
  );

  useEffect(() => {
    if (selectedPoiId && !pointsOfInterest.some(point => point.id === selectedPoiId)) {
      setSelectedPoiId('');
    }
  }, [pointsOfInterest, selectedPoiId]);

  const setSolidFootprintFromDrag = useCallback((start: TilePoint, end: TilePoint) => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const next: string[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        next.push(tileKey(x, y));
      }
    }

    setFootprintTiles(next);
  }, []);

  const imageExportPayload = useMemo(() => {
    const safeImageWidth = Math.max(1, loadedImageSize.width || 1);
    const safeImageHeight = Math.max(1, loadedImageSize.height || 1);

    return {
      tool: 'Footprint Asset Wizard',
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
        transform: {
          ...imageTransform,
          scale: Number(imageTransform.scale.toFixed(6))
        },
        pixelPreview: {
          enabled: true,
          pixelSize: GAME_PIXEL_SIZE
        },
        autoFitWidthToFootprint: autoFitImageWidth,
        footprintPixelWidth
      },
      pointsOfInterest: pointsOfInterest.map(point => ({
        id: point.id,
        name: point.name,
        local: {
          x: formatPointValue(point.localX),
          y: formatPointValue(point.localY)
        },
        normalized: {
          x: formatPointValue((point.localX + safeImageWidth * 0.5) / safeImageWidth),
          y: formatPointValue((point.localY + safeImageHeight * 0.5) / safeImageHeight)
        }
      }))
    };
  }, [
    assetLabel,
    autoFitImageWidth,
    buildingCategory,
    buildingCost,
    buildingId,
    buildingMaxCount,
    buildingName,
    footprintBounds.height,
    footprintBounds.width,
    footprintOffsets,
    footprintPixelWidth,
    imageTransform,
    loadedImageSize,
    pointsOfInterest
  ]);

  const imageDefinitionSnippet = useMemo(() => {
    const id = buildingId || 'new_building';
    return `
${id}: {
  id: '${id}',
  name: '${buildingName}',
  cost: ${Math.max(0, buildingCost)},
  desc: 'Custom building from Footprint Asset Wizard',
  width: ${footprintBounds.width},
  height: ${footprintBounds.height},
  maxHealth: 1000,
  category: '${buildingCategory}',
  maxCount: ${Math.max(1, buildingMaxCount)},
  maxLevel: 1
}`.trim();
  }, [buildingCategory, buildingCost, buildingId, buildingMaxCount, buildingName, footprintBounds.height, footprintBounds.width]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn('Clipboard write failed:', error);
    }
  }, []);

  const fitImageWidthToFootprint = useCallback((image: HTMLImageElement | null) => {
    if (!image) return;

    const targetWidth = Math.max(ISO_TILE_WIDTH, footprintPixelWidth);
    const nextScale = clamp(targetWidth / Math.max(1, image.width), 0.05, 16);

    setImageTransform(prev => {
      if (Math.abs(prev.scale - nextScale) < 0.00001) {
        return prev;
      }
      return { ...prev, scale: nextScale };
    });
  }, [footprintPixelWidth]);

  useEffect(() => {
    if (!autoFitImageWidth) return;
    fitImageWidthToFootprint(loadedImageRef.current);
  }, [autoFitImageWidth, fitImageWidthToFootprint, footprintPixelWidth, loadedImageSize.width]);

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

        // Always fit + center on upload for predictable first placement.
        const targetWidth = Math.max(ISO_TILE_WIDTH, footprintPixelWidth);
        const nextScale = clamp(targetWidth / Math.max(1, image.width), 0.05, 16);
        const bounds = getIsoBoundsFromTiles(footprintTiles.map(parseTileKey));
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerY = (bounds.minY + bounds.maxY) * 0.5;
        const visualLift = image.height * nextScale * 0.18;

        setImageTransform(prev => ({
          ...prev,
          scale: nextScale,
          isoX: centerX,
          isoY: centerY - visualLift
        }));
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  }, [footprintPixelWidth, footprintTiles]);

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

  const imageLocalToScreen = useCallback((
    localX: number,
    localY: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const view = getImageCanvasView(canvasWidth, canvasHeight);
    const centerX = view.originX + imageTransform.isoX;
    const centerY = view.originY + imageTransform.isoY;

    const scaledX = localX * imageTransform.scale;
    const scaledY = localY * imageTransform.scale;
    const rad = (imageTransform.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      x: centerX + scaledX * cos - scaledY * sin,
      y: centerY + scaledX * sin + scaledY * cos
    };
  }, [getImageCanvasView, imageTransform.isoX, imageTransform.isoY, imageTransform.rotationDeg, imageTransform.scale]);

  const screenToImageLocal = useCallback((
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const image = loadedImageRef.current;
    if (!image) return null;

    const view = getImageCanvasView(canvasWidth, canvasHeight);
    const centerX = view.originX + imageTransform.isoX;
    const centerY = view.originY + imageTransform.isoY;

    const dx = x - centerX;
    const dy = y - centerY;

    const rad = (-imageTransform.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;

    const scale = Math.max(0.0001, imageTransform.scale);

    return {
      x: rotatedX / scale,
      y: rotatedY / scale
    };
  }, [getImageCanvasView, imageTransform.isoX, imageTransform.isoY, imageTransform.rotationDeg, imageTransform.scale]);

  const isPointerInsideImage = useCallback((
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const image = loadedImageRef.current;
    if (!image) return false;

    const local = screenToImageLocal(x, y, canvasWidth, canvasHeight);
    if (!local) return false;

    return Math.abs(local.x) <= image.width * 0.5 && Math.abs(local.y) <= image.height * 0.5;
  }, [screenToImageLocal]);

  const findPoiAtScreen = useCallback((
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!selectedPoi) return null;
    const screen = imageLocalToScreen(selectedPoi.localX, selectedPoi.localY, canvasWidth, canvasHeight);
    const dx = x - screen.x;
    const dy = y - screen.y;
    if (dx * dx + dy * dy <= 11 * 11) {
      return selectedPoi.id;
    }
    return null;
  }, [imageLocalToScreen, selectedPoi]);

  const updatePoiPosition = useCallback((poiId: string, localX: number, localY: number) => {
    const image = loadedImageRef.current;
    if (!image) return;

    const clampedLocalX = clamp(localX, -image.width * 0.5, image.width * 0.5);
    const clampedLocalY = clamp(localY, -image.height * 0.5, image.height * 0.5);

    setPointsOfInterest(prev => prev.map(point => (
      point.id === poiId
        ? { ...point, localX: clampedLocalX, localY: clampedLocalY }
        : point
    )));
  }, []);

  const centerImageOnFootprint = useCallback(() => {
    const bounds = getIsoBoundsFromTiles(footprintTiles.map(parseTileKey));
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerY = (bounds.minY + bounds.maxY) * 0.5;

    setImageTransform(prev => {
      const image = loadedImageRef.current;
      const visualLift = image ? image.height * prev.scale * 0.18 : 52;

      return {
        ...prev,
        isoX: centerX,
        isoY: centerY - visualLift
      };
    });
  }, [footprintTiles]);

  const handleImageCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (toolMode === 'image') {
      const hitPoiId = findPoiAtScreen(x, y, rect.width, rect.height);
      if (hitPoiId) {
        poiDragRef.current = { active: true, poiId: hitPoiId };
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (!isPointerInsideImage(x, y, rect.width, rect.height)) return;
      const view = getImageCanvasView(rect.width, rect.height);
      imageDragRef.current = {
        active: true,
        offsetX: x - (view.originX + imageTransform.isoX),
        offsetY: y - (view.originY + imageTransform.isoY)
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (toolMode !== 'footprint') return;

    const tile = screenToTile(x, y, rect.width, rect.height);
    if (tile.x < 0 || tile.y < 0 || tile.x >= STUDIO_MAP_SIZE || tile.y >= STUDIO_MAP_SIZE) return;

    footprintDragRef.current = {
      active: true,
      start: tile
    };
    setHoverTile(tile);
    setSolidFootprintFromDrag(tile, tile);
    canvas.setPointerCapture(event.pointerId);
  }, [
    findPoiAtScreen,
    getImageCanvasView,
    imageTransform.isoX,
    imageTransform.isoY,
    isPointerInsideImage,
    screenToTile,
    setSolidFootprintFromDrag,
    toolMode,
  ]);

  const handleImageCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (poiDragRef.current.active && poiDragRef.current.poiId) {
      const local = screenToImageLocal(x, y, rect.width, rect.height);
      if (local) {
        updatePoiPosition(poiDragRef.current.poiId, local.x, local.y);
      }
      return;
    }

    if (imageDragRef.current.active) {
      const view = getImageCanvasView(rect.width, rect.height);
      setImageTransform(prev => ({
        ...prev,
        isoX: x - view.originX - imageDragRef.current.offsetX,
        isoY: y - view.originY - imageDragRef.current.offsetY
      }));
      return;
    }

    if (footprintDragRef.current.active && footprintDragRef.current.start) {
      const tile = screenToTile(x, y, rect.width, rect.height);
      const clampedTile = {
        x: clamp(tile.x, 0, STUDIO_MAP_SIZE - 1),
        y: clamp(tile.y, 0, STUDIO_MAP_SIZE - 1)
      };
      setHoverTile(clampedTile);
      setSolidFootprintFromDrag(footprintDragRef.current.start, clampedTile);
      return;
    }

    if (toolMode !== 'footprint') {
      setHoverTile(null);
      return;
    }

    const tile = screenToTile(x, y, rect.width, rect.height);
    if (tile.x < 0 || tile.y < 0 || tile.x >= STUDIO_MAP_SIZE || tile.y >= STUDIO_MAP_SIZE) {
      setHoverTile(null);
      return;
    }

    setHoverTile(tile);
  }, [getImageCanvasView, screenToImageLocal, screenToTile, setSolidFootprintFromDrag, toolMode, updatePoiPosition]);

  const handleImageCanvasPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    imageDragRef.current.active = false;
    poiDragRef.current = { active: false, poiId: null };
    footprintDragRef.current = { active: false, start: null };

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }, []);

  const addPoi = useCallback(() => {
    const cleanName = nextPoiName.trim();
    const pointName = cleanName || `poi_${pointsOfInterest.length + 1}`;
    const nextId = `poi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    const nextPoint: PointOfInterest = {
      id: nextId,
      name: pointName,
      localX: 0,
      localY: 0,
      color: '#f97316'
    };

    setPointsOfInterest(prev => [...prev, nextPoint]);
  }, [nextPoiName, pointsOfInterest.length]);

  const removeSelectedPoi = useCallback(() => {
    if (!selectedPoiId) return;
    setPointsOfInterest(prev => prev.filter(point => point.id !== selectedPoiId));
  }, [selectedPoiId]);

  const updateSelectedPoi = useCallback(<K extends keyof PointOfInterest>(key: K, value: PointOfInterest[K]) => {
    if (!selectedPoiId) return;
    setPointsOfInterest(prev => prev.map(point => (
      point.id === selectedPoiId
        ? { ...point, [key]: value }
        : point
    )));
  }, [selectedPoiId]);

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

    for (const key of footprintSet) {
      drawTileFill(parseTileKey(key), 'rgba(38, 87, 255, 0.32)');
    }

    if (hoverTile && toolMode === 'footprint') {
      drawTileFill(hoverTile, 'rgba(255, 255, 255, 0.3)');
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

    presentWithPixelation(
      ctx,
      sceneBuffer,
      width,
      height,
      dpr,
      GAME_PIXEL_SIZE,
      imagePixelBufferRef
    );

    // Draw POI overlay after pixelation so markers/text remain crisp.
    if (toolMode === 'image' && image && selectedPoi) {
      const marker = imageLocalToScreen(selectedPoi.localX, selectedPoi.localY, width, height);
      const label = selectedPoi.name || selectedPoi.id;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.font = '12px monospace';

      ctx.beginPath();
      ctx.fillStyle = selectedPoi.color;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      ctx.arc(marker.x, marker.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const textWidth = ctx.measureText(label).width;
      const boxX = marker.x + 10;
      const boxY = marker.y - 10;
      ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
      ctx.fillRect(boxX - 4, boxY - 11, textWidth + 8, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, boxX, boxY);
    }
  }, [
    footprintTiles,
    getImageCanvasView,
    hoverTile,
    imageLocalToScreen,
    imageTransform.isoX,
    imageTransform.isoY,
    imageTransform.opacity,
    imageTransform.rotationDeg,
    imageTransform.scale,
    selectedPoi,
    toolMode,
    windowTick
  ]);

  return (
    <div className="dev-studio-root">
      <header className="dev-studio-header">
        <div>
          <h1>Footprint Asset Wizard</h1>
          <p>Footprint + imported image + named POIs for animation anchor handoff.</p>
        </div>
        <div className="dev-studio-header-actions">
          <div className="pill">Game Pixel Size: {GAME_PIXEL_SIZE}px</div>
        </div>
      </header>

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
            <h2>Tool</h2>
            <div className="button-row">
              {(['footprint', 'image'] as StudioToolMode[]).map(mode => (
                <button
                  key={mode}
                  className={toolMode === mode ? 'active' : ''}
                  onClick={() => setToolMode(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="panel-note">`footprint`: drag a solid footprint area, `image`: drag imported image and selected POI marker.</div>
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
          </div>

          <div className="panel-block">
            <h2>Footprint</h2>
            <div className="stat-line">Selected tiles: {footprintTiles.length}</div>
            <div className="stat-line">Bounds: {footprintBounds.width} x {footprintBounds.height}</div>
            <div className="stat-line">Target image width: {Math.round(footprintPixelWidth)} px</div>
            <div className="button-row">
              <button
                type="button"
                onClick={() => setFootprintTiles([
                  tileKey(0, 0),
                  tileKey(1, 0),
                  tileKey(0, 1),
                  tileKey(1, 1)
                ])}
              >
                Reset 2x2
              </button>
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
            <details className="panel-dropdown">
              <summary>Placement & Transform</summary>
              <div className="panel-dropdown-body">
                <label className="inline-switch">
                  <input
                    type="checkbox"
                    checked={autoFitImageWidth}
                    onChange={event => setAutoFitImageWidth(event.target.checked)}
                  />
                  Auto-fit width when footprint changes
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
                      step="0.01"
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
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => fitImageWidthToFootprint(loadedImageRef.current)}
                    disabled={!loadedImageRef.current}
                  >
                    Fit Width Now
                  </button>
                  <button
                    type="button"
                    onClick={centerImageOnFootprint}
                  >
                    Center On Footprint
                  </button>
                </div>
              </div>
            </details>
            <div className="stat-line">Image size: {loadedImageSize.width} x {loadedImageSize.height}</div>
          </div>

          <div className="panel-block">
            <h2>Points Of Interest</h2>
            <div className="add-poi-row">
              <input
                value={nextPoiName}
                onChange={event => setNextPoiName(event.target.value)}
                placeholder="poi_name"
              />
              <button type="button" onClick={addPoi}>Add</button>
            </div>
            <div className="poi-list">
              {pointsOfInterest.map(point => (
                <button
                  key={point.id}
                  type="button"
                  className={point.id === selectedPoiId ? 'active' : ''}
                  onClick={() => {
                    setSelectedPoiId(point.id);
                    setToolMode('image');
                  }}
                >
                  {point.name}
                </button>
              ))}
            </div>

            {!selectedPoi && (
              <div className="panel-note">Select a POI from the list to show its position marker.</div>
            )}

            {selectedPoi && (
              <div className="poi-editor">
                <label>
                  Name
                  <input value={selectedPoi.name} onChange={event => updateSelectedPoi('name', event.target.value)} />
                </label>
                <div className="grid-two">
                  <label>
                    Color
                    <input type="color" value={selectedPoi.color} onChange={event => updateSelectedPoi('color', event.target.value)} />
                  </label>
                  <label>
                    X (local)
                    <input
                      type="number"
                      value={selectedPoi.localX}
                      onChange={event => updatePoiPosition(selectedPoi.id, Number(event.target.value), selectedPoi.localY)}
                    />
                  </label>
                  <label>
                    Y (local)
                    <input
                      type="number"
                      value={selectedPoi.localY}
                      onChange={event => updatePoiPosition(selectedPoi.id, selectedPoi.localX, Number(event.target.value))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="danger"
                  onClick={removeSelectedPoi}
                  disabled={pointsOfInterest.length === 0}
                >
                  Delete POI
                </button>
              </div>
            )}
          </div>

          <div className="panel-block">
            <h2>Export</h2>
            <div className="button-row">
              <button type="button" onClick={() => copyText(JSON.stringify(imageExportPayload, null, 2))}>Copy JSON</button>
              <button type="button" onClick={() => copyText(imageDefinitionSnippet)}>Copy Definition Snippet</button>
            </div>
            <textarea readOnly value={JSON.stringify(imageExportPayload, null, 2)} rows={12} />
          </div>
        </aside>
      </div>
    </div>
  );
}
