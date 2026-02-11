# Adding Buildings

This is the practical end-to-end flow.

## Part 1: Prepare Asset Data in the Wizard

1. Run `npm run dev:studio`.
2. Set building metadata in **Building Data**.
3. Drag on the grid to create a solid footprint area.
4. Load building image(s) in **Image Asset** states.
5. Add POIs if animators need exact named anchors.
6. Export either:
- **Copy JSON (External Assets)** (recommended): this also auto-saves images and JSON to `public/assets/buildings/<building-id>/` in local dev.
- **Download State Images** only as fallback/manual export.

What you get in JSON:
- Dimensions and footprint tiles
- Image states and transforms
- Image references (`sourceAsset`)
- Ground plane config
- POIs

If you also need an isometric guide image for external tools:
- Click **Export Footprint PNG**

## Part 2: Wire the Building into the Game

The game does not auto-register buildings from wizard JSON, so do these code steps.

### 1) Add definition and type

Edit:
- `src/game/config/GameDefinitions.ts`

Do:
1. Add your ID to `BuildingType`.
2. Add entry in `BUILDING_DEFINITIONS`.

### 2) Add icon (shop/HUD)

Edit:
- `src/icons/accurate-icons.css`

Add class:
- `<building-id>-icon::before`

### 3) Add renderer

Edit:
- `src/game/renderers/BuildingRenderer.ts`

Follow the base-vs-elevated drawing contract from:
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/RENDERING_AND_DEPTH.md`

### 4) Register renderer in scene

Edit:
- `src/game/scenes/MainScene.ts`

Add a `case` in `drawBuildingVisuals(...)` for your building ID.

### 5) Add gameplay logic only if needed

- Resource building: update resource tick logic
- Defense building: update combat logic

Primary location:
- `src/game/scenes/MainScene.ts`

### 6) Verify

- Can buy/place from shop
- Footprint collision works
- Layering is correct around troops/walls
- Upgrade/move behavior works

## Common Questions

### Where do I put image files after export?

If you use Copy JSON in local dev, files are written automatically into `public/assets/buildings/<building-id>/`.

If auto-save is unavailable, store images using the emitted `sourceAsset.relativePath` (or your own stable convention like `public/assets/buildings/<id>/...`).
