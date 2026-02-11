# Footprint Asset Wizard

Route:
- `http://127.0.0.1:5173/dev/studio`

Run:

```bash
npm run dev:studio
```

## What This Tool Is For

Use it to prepare a building art package:
- Footprint tiles
- One or more building image states
- Image transform data
- Optional ground plane overlay
- POIs (named anchor points)

## Quick Workflow

1. Fill **Building Data** (bottom panel): ID, name, cost, max count, category.
2. Create footprint by dragging directly on the green grid.
3. In **Image Asset**, load an image for the selected state.
4. Add additional states if needed (for example `damaged`).
5. Drag the building image to align it; use fit/center controls if needed.
6. Optional: enable **Ground Plane** (it is locked to footprint tiles, not movable).
7. Optional: add POIs, select one to view/drag its marker.
8. Export with:
- **Copy JSON (External Assets)** for compact JSON using file references. It also auto-saves images + JSON into `public/assets/buildings/<building-id>/` in local dev.
- **Download State Images** only as a fallback/manual export.
- **Export Footprint PNG** for an isometric guide.

## FAQ

### Why is JSON smaller now?

External export stores only `sourceAsset` file references in JSON (not embedded image bytes).

### So one export handles everything?

Yes for local wizard usage: **Copy JSON (External Assets)** writes JSON + image files directly into your local `public/assets/buildings/<building-id>/` folder.

One JSON payload contains building data + image states + transforms + POIs + ground plane config.

For runtime integration into this game codebase: not fully automatic.
You still need to wire the building into definitions/renderers.

### What is the footprint PNG for?

`Export Footprint PNG` gives a neutral gray isometric footprint guide. Use it as a reference in AI image tools to keep camera angle and tile alignment consistent.

## Output Structure (JSON Export)

Top-level keys:
- `tool`
- `building`
- `art`
- `pointsOfInterest`

Important nested fields:
- `building.footprintTiles`
- `art.assetStorage.mode` (`external_files`)
- `art.assetStorage.basePath`
- `art.states[].sourceAsset.fileName`
- `art.states[].sourceAsset.relativePath`
- `art.states[].sourceAsset.mimeType`
- `art.states[].transform`
- `art.groundPlane`
- `pointsOfInterest[].local`
- `pointsOfInterest[].normalized`

## Optional File Organization (If You Prefer Physical Files)

For external mode, the wizard already emits a convention like:
- `public/assets/buildings/<building-id>/<state-name>.png`
- `public/assets/buildings/<building-id>/<building-id>.wizard.json`

Adjust the base path if your runtime expects a different asset location.
