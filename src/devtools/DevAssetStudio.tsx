import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import './DevAssetStudio.css';

const ISO_TILE_WIDTH = 64;
const ISO_TILE_HEIGHT = 32;
const ISO_HALF_W = ISO_TILE_WIDTH * 0.5;
const ISO_HALF_H = ISO_TILE_HEIGHT * 0.5;
const STUDIO_MAP_SIZE = 25;
const GAME_PIXEL_SIZE = 1.5;

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

interface GroundPlaneConfig {
  enabled: boolean;
  color: string;
  opacity: number;
}

interface ImageStateConfig {
  id: string;
  name: string;
  sourceDataUrl: string | null;
  naturalSize: { width: number; height: number };
  transform: ImageTransform;
}

interface ExternalImageAssetRef {
  fileName: string;
  relativePath: string;
  mimeType: string;
}

const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  isoX: 0,
  isoY: -68,
  scale: 1,
  rotationDeg: 0,
  opacity: 1
};

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

function sanitizeSlug(value: string, fallback: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function extensionFromMimeType(mimeType: string | null) {
  if (!mimeType) return 'png';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/svg+xml') return 'svg';
  const [, subtype = 'png'] = mimeType.split('/');
  return subtype.replace(/[^a-z0-9]+/gi, '') || 'png';
}

function parseDataUrlMetadata(dataUrl: string | null) {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return { mimeType: null as string | null, extension: 'png' };
  }
  const match = /^data:([^;,]+)[^,]*,/i.exec(dataUrl);
  const mimeType = match?.[1]?.toLowerCase() ?? null;
  return {
    mimeType,
    extension: extensionFromMimeType(mimeType)
  };
}

function buildExternalAssetRef(buildingSlug: string, state: ImageStateConfig, index: number): ExternalImageAssetRef | null {
  if (!state.sourceDataUrl) return null;
  const { mimeType, extension } = parseDataUrlMetadata(state.sourceDataUrl);
  const stateSlug = sanitizeSlug(state.name || state.id, `state_${index + 1}`);
  const fileName = `${stateSlug}.${extension}`;
  return {
    fileName,
    relativePath: `assets/buildings/${buildingSlug}/${fileName}`,
    mimeType: mimeType ?? 'image/png'
  };
}

export function DevAssetStudio() {
  const [windowTick, setWindowTick] = useState(0);

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

  const [imageStates, setImageStates] = useState<ImageStateConfig[]>([
    {
      id: 'state_default',
      name: 'default',
      sourceDataUrl: null,
      naturalSize: { width: 0, height: 0 },
      transform: { ...DEFAULT_IMAGE_TRANSFORM }
    }
  ]);
  const [selectedImageStateId, setSelectedImageStateId] = useState('state_default');
  const [nextImageStateName, setNextImageStateName] = useState('damaged');
  const [autoFitImageWidth, setAutoFitImageWidth] = useState(true);
  const [groundPlane, setGroundPlane] = useState<GroundPlaneConfig>({
    enabled: false,
    color: '#5f6670',
    opacity: 0.45
  });

  const [pointsOfInterest, setPointsOfInterest] = useState<PointOfInterest[]>([]);
  const [selectedPoiId, setSelectedPoiId] = useState('');
  const [nextPoiName, setNextPoiName] = useState('new_poi');

  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageSceneBufferRef = useRef<HTMLCanvasElement | null>(null);
  const imagePixelBufferRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageMapRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const imageDragRef = useRef<{ active: boolean; offsetX: number; offsetY: number }>({
    active: false,
    offsetX: 0,
    offsetY: 0
  });
  const lastAutoFitFootprintWidthRef = useRef<number>(ISO_TILE_WIDTH);

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

  const selectedImageState = useMemo(
    () => imageStates.find(state => state.id === selectedImageStateId) ?? null,
    [imageStates, selectedImageStateId]
  );
  const selectedImageTransform = selectedImageState?.transform ?? DEFAULT_IMAGE_TRANSFORM;
  const selectedImageSize = selectedImageState?.naturalSize ?? { width: 0, height: 0 };
  const selectedLoadedImage = selectedImageState
    ? loadedImageMapRef.current.get(selectedImageState.id) ?? null
    : null;

  const selectedPoi = useMemo(
    () => pointsOfInterest.find(point => point.id === selectedPoiId) ?? null,
    [pointsOfInterest, selectedPoiId]
  );

  useEffect(() => {
    if (selectedImageStateId && !imageStates.some(state => state.id === selectedImageStateId)) {
      setSelectedImageStateId(imageStates[0]?.id ?? '');
    }
  }, [imageStates, selectedImageStateId]);

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
    const safeImageWidth = Math.max(1, selectedImageSize.width || 1);
    const safeImageHeight = Math.max(1, selectedImageSize.height || 1);

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
        mode: 'image_states',
        activeStateId: selectedImageStateId,
        states: imageStates.map(state => ({
          id: state.id,
          name: state.name,
          sourceDataUrl: state.sourceDataUrl,
          naturalSize: state.naturalSize,
          transform: {
            ...state.transform,
            scale: Number(state.transform.scale.toFixed(6))
          }
        })),
        groundPlane: {
          fitTo: 'footprint',
          movable: false,
          ...groundPlane,
          opacity: Number(groundPlane.opacity.toFixed(3))
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
    groundPlane,
    imageStates,
    pointsOfInterest,
    selectedImageSize.height,
    selectedImageSize.width,
    selectedImageStateId
  ]);

  const safeBuildingSlug = useMemo(
    () => sanitizeSlug(buildingId || buildingName, 'custom_building'),
    [buildingId, buildingName]
  );

  const compactImageExportPayload = useMemo(() => {
    return {
      ...imageExportPayload,
      art: {
        ...imageExportPayload.art,
        assetStorage: {
          mode: 'external_files',
          basePath: `assets/buildings/${safeBuildingSlug}`
        },
        states: imageExportPayload.art.states.map((state, index) => {
          const originalState = imageStates[index];
          const assetRef = originalState ? buildExternalAssetRef(safeBuildingSlug, originalState, index) : null;
          return {
            id: state.id,
            name: state.name,
            naturalSize: state.naturalSize,
            transform: state.transform,
            sourceAsset: assetRef
          };
        })
      }
    };
  }, [imageExportPayload, imageStates, safeBuildingSlug]);

  const compactExportText = useMemo(
    () => JSON.stringify(compactImageExportPayload, null, 2),
    [compactImageExportPayload]
  );
  const compactExportSizeKb = useMemo(
    () => (new Blob([compactExportText]).size / 1024).toFixed(1),
    [compactExportText]
  );

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard write failed:', error);
      return false;
    }
  }, []);

  const saveExternalAssetsToWorkspace = useCallback(async () => {
    const statesToSave = imageStates
      .map((state, index) => {
        const assetRef = buildExternalAssetRef(safeBuildingSlug, state, index);
        if (!assetRef || !state.sourceDataUrl) return null;
        return {
          fileName: assetRef.fileName,
          dataUrl: state.sourceDataUrl
        };
      })
      .filter((item): item is { fileName: string; dataUrl: string } => item !== null);

    const response = await fetch('/__studio/save-external-assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        buildingSlug: safeBuildingSlug,
        jsonFileName: `${safeBuildingSlug}.wizard.json`,
        jsonText: compactExportText,
        states: statesToSave
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Unable to save assets (${response.status})`);
    }
  }, [compactExportText, imageStates, safeBuildingSlug]);

  const copyExternalJsonAndAutoSave = useCallback(async () => {
    let savedToWorkspace = false;
    try {
      await saveExternalAssetsToWorkspace();
      savedToWorkspace = true;
    } catch (error) {
      console.warn('Workspace save failed:', error);
    }

    const copied = await copyText(compactExportText);
    if (!copied && !savedToWorkspace) {
      window.alert('Copy failed and local asset save failed. Keep the wizard open and try again.');
      return;
    }

    if (!savedToWorkspace) {
      window.alert('JSON copied. Auto-save to public/assets/buildings failed, so use "Download State Images" as fallback.');
      return;
    }

    window.alert(`JSON copied and assets saved to public/assets/buildings/${safeBuildingSlug}/`);
  }, [compactExportText, copyText, safeBuildingSlug, saveExternalAssetsToWorkspace]);

  const downloadExternalAssetImages = useCallback(() => {
    let downloaded = 0;
    imageStates.forEach((state, index) => {
      if (!state.sourceDataUrl) return;
      const assetRef = buildExternalAssetRef(safeBuildingSlug, state, index);
      if (!assetRef) return;
      const link = document.createElement('a');
      link.href = state.sourceDataUrl;
      link.download = assetRef.fileName;
      link.click();
      downloaded += 1;
    });
    if (downloaded === 0) {
      window.alert('No state images to download yet.');
    }
  }, [imageStates, safeBuildingSlug]);

  const exportFootprintPng = useCallback(() => {
    const tiles = footprintOffsets.length > 0 ? footprintOffsets : [{ x: 0, y: 0 }];
    const bounds = getIsoBoundsFromTiles(tiles);
    const padding = 48;
    const canvasWidth = Math.max(160, Math.ceil(bounds.width + padding * 2));
    const canvasHeight = Math.max(160, Math.ceil(bounds.height + padding * 2));

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#b8bcc3';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const originX = padding - bounds.minX;
    const originY = padding - bounds.minY;

    const sortedTiles = [...tiles].sort((a, b) => {
      const da = a.x + a.y;
      const db = b.x + b.y;
      if (da !== db) return da - db;
      return a.x - b.x;
    });

    const footprintSet = new Set(tiles.map(tile => tileKey(tile.x, tile.y)));

    for (const tile of sortedTiles) {
      const top = toIso(tile.x, tile.y);
      const right = toIso(tile.x + 1, tile.y);
      const bottom = toIso(tile.x + 1, tile.y + 1);
      const left = toIso(tile.x, tile.y + 1);

      ctx.beginPath();
      ctx.moveTo(originX + top.x, originY + top.y);
      ctx.lineTo(originX + right.x, originY + right.y);
      ctx.lineTo(originX + bottom.x, originY + bottom.y);
      ctx.lineTo(originX + left.x, originY + left.y);
      ctx.closePath();
      ctx.fillStyle = '#d9dde2';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74, 85, 104, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 3;
    for (const tile of sortedTiles) {
      const top = toIso(tile.x, tile.y);
      const right = toIso(tile.x + 1, tile.y);
      const bottom = toIso(tile.x + 1, tile.y + 1);
      const left = toIso(tile.x, tile.y + 1);

      const hasNorth = footprintSet.has(tileKey(tile.x, tile.y - 1));
      const hasEast = footprintSet.has(tileKey(tile.x + 1, tile.y));
      const hasSouth = footprintSet.has(tileKey(tile.x, tile.y + 1));
      const hasWest = footprintSet.has(tileKey(tile.x - 1, tile.y));

      const drawEdge = (from: IsoPoint, to: IsoPoint) => {
        ctx.beginPath();
        ctx.moveTo(originX + from.x, originY + from.y);
        ctx.lineTo(originX + to.x, originY + to.y);
        ctx.stroke();
      };

      if (!hasNorth) drawEdge(top, right);
      if (!hasEast) drawEdge(right, bottom);
      if (!hasSouth) drawEdge(bottom, left);
      if (!hasWest) drawEdge(left, top);
    }

    const safeId = (buildingId.trim() || 'footprint').replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${safeId}_footprint_guide.png`;
    link.click();
  }, [buildingId, footprintOffsets]);

  const updateSelectedImageState = useCallback((updater: (state: ImageStateConfig) => ImageStateConfig) => {
    if (!selectedImageStateId) return;
    setImageStates(prev => prev.map(state => (state.id === selectedImageStateId ? updater(state) : state)));
  }, [selectedImageStateId]);

  const setSelectedImageTransform = useCallback((updater: (prev: ImageTransform) => ImageTransform) => {
    updateSelectedImageState(state => ({ ...state, transform: updater(state.transform) }));
  }, [updateSelectedImageState]);

  const addImageState = useCallback(() => {
    const stateName = nextImageStateName.trim() || `state_${imageStates.length + 1}`;
    const stateId = `state_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const nextState: ImageStateConfig = {
      id: stateId,
      name: stateName,
      sourceDataUrl: null,
      naturalSize: { width: 0, height: 0 },
      transform: { ...DEFAULT_IMAGE_TRANSFORM }
    };
    setImageStates(prev => [...prev, nextState]);
    setSelectedImageStateId(stateId);
  }, [imageStates.length, nextImageStateName]);

  const removeSelectedImageState = useCallback(() => {
    if (!selectedImageStateId || imageStates.length <= 1) return;
    loadedImageMapRef.current.delete(selectedImageStateId);
    setImageStates(prev => prev.filter(state => state.id !== selectedImageStateId));
  }, [imageStates.length, selectedImageStateId]);

  const fitImageWidthToFootprint = useCallback((image: HTMLImageElement | null) => {
    if (!image) return;

    const targetWidth = Math.max(ISO_TILE_WIDTH, footprintPixelWidth);
    const nextScale = clamp(targetWidth / Math.max(1, image.width), 0.05, 16);

    setSelectedImageTransform(prev => {
      if (Math.abs(prev.scale - nextScale) < 0.00001) {
        return prev;
      }
      return { ...prev, scale: nextScale };
    });
  }, [footprintPixelWidth, setSelectedImageTransform]);

  useEffect(() => {
    if (!selectedImageState) return;
    const src = selectedImageState.sourceDataUrl;
    if (!src) return;
    if (loadedImageMapRef.current.has(selectedImageState.id)) return;

    const image = new Image();
    image.onload = () => {
      loadedImageMapRef.current.set(selectedImageState.id, image);
      setWindowTick(prev => prev + 1);
    };
    image.src = src;
  }, [selectedImageState]);

  useEffect(() => {
    if (!autoFitImageWidth) {
      lastAutoFitFootprintWidthRef.current = footprintPixelWidth;
      return;
    }

    if (lastAutoFitFootprintWidthRef.current === footprintPixelWidth) {
      return;
    }

    lastAutoFitFootprintWidthRef.current = footprintPixelWidth;
    fitImageWidthToFootprint(selectedLoadedImage);
  }, [autoFitImageWidth, fitImageWidthToFootprint, footprintPixelWidth, selectedLoadedImage]);

  const loadImageFile = useCallback((file: File | null) => {
    if (!file || !selectedImageStateId) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== 'string') return;

      const image = new Image();
      image.onload = () => {
        loadedImageMapRef.current.set(selectedImageStateId, image);

        // Always fit + center on upload for predictable first placement.
        const targetWidth = Math.max(ISO_TILE_WIDTH, footprintPixelWidth);
        const nextScale = clamp(targetWidth / Math.max(1, image.width), 0.05, 16);
        const bounds = getIsoBoundsFromTiles(footprintTiles.map(parseTileKey));
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerY = (bounds.minY + bounds.maxY) * 0.5;
        const visualLift = image.height * nextScale * 0.18;

        updateSelectedImageState(state => ({
          ...state,
          sourceDataUrl: src,
          naturalSize: { width: image.width, height: image.height },
          transform: {
            ...state.transform,
            scale: nextScale,
            isoX: centerX,
            isoY: centerY - visualLift
          }
        }));
        setWindowTick(prev => prev + 1);
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  }, [footprintPixelWidth, footprintTiles, selectedImageStateId, updateSelectedImageState]);

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
    const centerX = view.originX + selectedImageTransform.isoX;
    const centerY = view.originY + selectedImageTransform.isoY;

    const scaledX = localX * selectedImageTransform.scale;
    const scaledY = localY * selectedImageTransform.scale;
    const rad = (selectedImageTransform.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      x: centerX + scaledX * cos - scaledY * sin,
      y: centerY + scaledX * sin + scaledY * cos
    };
  }, [getImageCanvasView, selectedImageTransform.isoX, selectedImageTransform.isoY, selectedImageTransform.rotationDeg, selectedImageTransform.scale]);

  const screenToImageLocal = useCallback((
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const image = selectedLoadedImage;
    if (!image) return null;

    const view = getImageCanvasView(canvasWidth, canvasHeight);
    const centerX = view.originX + selectedImageTransform.isoX;
    const centerY = view.originY + selectedImageTransform.isoY;

    const dx = x - centerX;
    const dy = y - centerY;

    const rad = (-selectedImageTransform.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;

    const scale = Math.max(0.0001, selectedImageTransform.scale);

    return {
      x: rotatedX / scale,
      y: rotatedY / scale
    };
  }, [getImageCanvasView, selectedImageTransform.isoX, selectedImageTransform.isoY, selectedImageTransform.rotationDeg, selectedImageTransform.scale, selectedLoadedImage]);

  const isPointerInsideImage = useCallback((
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const image = selectedLoadedImage;
    if (!image) return false;

    const local = screenToImageLocal(x, y, canvasWidth, canvasHeight);
    if (!local) return false;

    return Math.abs(local.x) <= image.width * 0.5 && Math.abs(local.y) <= image.height * 0.5;
  }, [screenToImageLocal, selectedLoadedImage]);

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
    const image = selectedLoadedImage;
    if (!image) return;

    const clampedLocalX = clamp(localX, -image.width * 0.5, image.width * 0.5);
    const clampedLocalY = clamp(localY, -image.height * 0.5, image.height * 0.5);

    setPointsOfInterest(prev => prev.map(point => (
      point.id === poiId
        ? { ...point, localX: clampedLocalX, localY: clampedLocalY }
        : point
    )));
  }, [selectedLoadedImage]);

  const centerImageOnFootprint = useCallback(() => {
    const bounds = getIsoBoundsFromTiles(footprintTiles.map(parseTileKey));
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerY = (bounds.minY + bounds.maxY) * 0.5;

    setSelectedImageTransform(prev => {
      const image = selectedLoadedImage;
      const visualLift = image ? image.height * prev.scale * 0.18 : 52;

      return {
        ...prev,
        isoX: centerX,
        isoY: centerY - visualLift
      };
    });
  }, [footprintTiles, selectedLoadedImage, setSelectedImageTransform]);

  const handleImageCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const hitPoiId = findPoiAtScreen(x, y, rect.width, rect.height);
    if (hitPoiId) {
      poiDragRef.current = { active: true, poiId: hitPoiId };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (isPointerInsideImage(x, y, rect.width, rect.height)) {
      const view = getImageCanvasView(rect.width, rect.height);
      imageDragRef.current = {
        active: true,
        offsetX: x - (view.originX + selectedImageTransform.isoX),
        offsetY: y - (view.originY + selectedImageTransform.isoY)
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

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
    isPointerInsideImage,
    screenToTile,
    selectedImageTransform.isoX,
    selectedImageTransform.isoY,
    setSolidFootprintFromDrag,
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
      setSelectedImageTransform(prev => ({
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

    const tile = screenToTile(x, y, rect.width, rect.height);
    if (tile.x < 0 || tile.y < 0 || tile.x >= STUDIO_MAP_SIZE || tile.y >= STUDIO_MAP_SIZE) {
      setHoverTile(null);
      return;
    }

    setHoverTile(tile);
  }, [getImageCanvasView, screenToImageLocal, screenToTile, setSelectedImageTransform, setSolidFootprintFromDrag, updatePoiPosition]);

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

    if (hoverTile) {
      drawTileFill(hoverTile, 'rgba(255, 255, 255, 0.3)');
    }

    if (groundPlane.enabled) {
      // Ground plane is always footprint-locked (never image-locked).
      sceneCtx.save();
      sceneCtx.globalAlpha = clamp(groundPlane.opacity, 0, 1);
      for (const key of footprintSet) {
        drawTileFill(parseTileKey(key), groundPlane.color);
      }
      sceneCtx.restore();
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

    const image = selectedLoadedImage;

    if (image) {
      sceneCtx.save();
      sceneCtx.translate(view.originX + selectedImageTransform.isoX, view.originY + selectedImageTransform.isoY);
      sceneCtx.rotate((selectedImageTransform.rotationDeg * Math.PI) / 180);
      sceneCtx.globalAlpha = clamp(selectedImageTransform.opacity, 0.1, 1);
      sceneCtx.imageSmoothingEnabled = true;
      sceneCtx.drawImage(
        image,
        -0.5 * image.width * selectedImageTransform.scale,
        -0.5 * image.height * selectedImageTransform.scale,
        image.width * selectedImageTransform.scale,
        image.height * selectedImageTransform.scale
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
    if (image && selectedPoi) {
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
    groundPlane,
    hoverTile,
    imageLocalToScreen,
    selectedPoi,
    selectedImageTransform.isoX,
    selectedImageTransform.isoY,
    selectedImageTransform.opacity,
    selectedImageTransform.rotationDeg,
    selectedImageTransform.scale,
    selectedLoadedImage,
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
          <div className="panel-note">Drag on grid to edit footprint. Drag/click the building image to edit image placement.</div>

          <div className="panel-block">
            <h2>Image Asset</h2>
            <div className="add-poi-row">
              <input
                value={nextImageStateName}
                onChange={event => setNextImageStateName(event.target.value)}
                placeholder="new_state"
              />
              <button type="button" onClick={addImageState}>Add State</button>
            </div>
            <div className="poi-list">
              {imageStates.map(state => (
                <button
                  key={state.id}
                  type="button"
                  className={state.id === selectedImageStateId ? 'active' : ''}
                  onClick={() => setSelectedImageStateId(state.id)}
                >
                  {state.name}
                </button>
              ))}
            </div>
            <label>
              State Name
              <input
                value={selectedImageState?.name ?? ''}
                onChange={event => updateSelectedImageState(state => ({ ...state, name: event.target.value }))}
                disabled={!selectedImageState}
              />
            </label>
            <label className="file-input">
              Load Image
              <input
                type="file"
                accept="image/*"
                onChange={event => loadImageFile(event.target.files?.[0] ?? null)}
                disabled={!selectedImageState}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="danger"
                onClick={removeSelectedImageState}
                disabled={imageStates.length <= 1}
              >
                Delete Selected State
              </button>
            </div>
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
                      value={Math.round(selectedImageTransform.isoX)}
                      onChange={event => setSelectedImageTransform(prev => ({ ...prev, isoX: Number(event.target.value) }))}
                      disabled={!selectedImageState}
                    />
                  </label>
                  <label>
                    Iso Y
                    <input
                      type="number"
                      value={Math.round(selectedImageTransform.isoY)}
                      onChange={event => setSelectedImageTransform(prev => ({ ...prev, isoY: Number(event.target.value) }))}
                      disabled={!selectedImageState}
                    />
                  </label>
                  <label>
                    Scale
                    <input
                      type="number"
                      step="0.01"
                      value={selectedImageTransform.scale}
                      onChange={event => setSelectedImageTransform(prev => ({ ...prev, scale: Number(event.target.value) }))}
                      disabled={!selectedImageState}
                    />
                  </label>
                  <label>
                    Rotation
                    <input
                      type="number"
                      step="1"
                      value={selectedImageTransform.rotationDeg}
                      onChange={event => setSelectedImageTransform(prev => ({ ...prev, rotationDeg: Number(event.target.value) }))}
                      disabled={!selectedImageState}
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
                    value={selectedImageTransform.opacity}
                    onChange={event => setSelectedImageTransform(prev => ({ ...prev, opacity: Number(event.target.value) }))}
                    disabled={!selectedImageState}
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => fitImageWidthToFootprint(selectedLoadedImage)}
                    disabled={!selectedLoadedImage}
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

                <div className="subsection">
                  <label className="inline-switch">
                    <input
                      type="checkbox"
                      checked={groundPlane.enabled}
                      onChange={event => setGroundPlane(prev => ({ ...prev, enabled: event.target.checked }))}
                    />
                    Enable Ground Plane
                  </label>
                  <div className="panel-note">Ground plane is locked to the footprint zone and is not movable.</div>
                  {groundPlane.enabled && (
                    <div className="grid-two">
                      <label>
                        Color
                        <input
                          type="color"
                          value={groundPlane.color}
                          onChange={event => setGroundPlane(prev => ({ ...prev, color: event.target.value }))}
                        />
                      </label>
                      <label>
                        Opacity
                        <input
                          type="number"
                          step="0.05"
                          min={0}
                          max={1}
                          value={groundPlane.opacity}
                          onChange={event => setGroundPlane(prev => ({ ...prev, opacity: Number(event.target.value) }))}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </details>
            <div className="stat-line">Image size: {selectedImageSize.width} x {selectedImageSize.height}</div>
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
                  onClick={() => setSelectedPoiId(point.id)}
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
              <button type="button" onClick={copyExternalJsonAndAutoSave}>Copy JSON (External Assets)</button>
              <button type="button" onClick={downloadExternalAssetImages}>Download State Images</button>
              <button type="button" onClick={exportFootprintPng}>Export Footprint PNG</button>
            </div>
            <div className="panel-note">
              JSON size: {compactExportSizeKb} KB
            </div>
            <div className="panel-note">Copy JSON auto-saves images and JSON to `public/assets/buildings/&lt;building-id&gt;/` in local dev.</div>
            <div className="panel-note">PNG export uses a neutral gray background with only the isometric footprint guide.</div>
            <textarea readOnly value={compactExportText} rows={12} />
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
        </aside>
      </div>
    </div>
  );
}
