# Documentation

Use this page as the entry point.

## Fast Path: Make a Building from an Image

1. Run `npm run dev:studio`.
2. Drag on the green grid to create the building footprint.
3. Load one or more images as states (default, damaged, etc).
4. Add POIs (named points) if artists/animators need anchor positions.
5. Click **Copy JSON (External Assets)** for compact JSON. In local dev it also auto-saves JSON + state images into `public/assets/buildings/<building-id>/`.
6. Click **Export Footprint PNG** if you want a gray isometric guide image.

Full wizard guide:
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/FOOTPRINT_ASSET_WIZARD.md`

## What Is Included in JSON Export

- Building info (`id`, `name`, `category`, `cost`, `maxCount`)
- Footprint geometry (`width`, `height`, `footprintTiles`)
- Image states (`states[]`, transforms, active state)
- External asset references (`sourceAsset`)
- Ground plane config
- POIs with local + normalized coordinates

Copy JSON keeps JSON small and writes image files in local dev; fallback is manual image download.

## What Is Not Automatic

The wizard does not modify game code by itself.
You still need to wire the building into the game:
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ADDING_BUILDINGS.md`

## Other Docs

- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ADDING_BUILDINGS.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/RENDERING_AND_DEPTH.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ADDING_TROOPS.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ARCHITECTURE.md`
