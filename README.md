# Clash Prototype + Footprint Asset Wizard

This repo contains:
- The game prototype (`/game` route)
- The Footprint Asset Wizard (`/dev/studio` route) for building art + footprint data

## Quick Start

Requirements:
- Node.js 20.x

Install and run:

```bash
npm install
npm run dev:game
```

Open the wizard directly:

```bash
npm run dev:studio
```

If `127.0.0.1:5173` is already in use, stop the other dev server first.

## Wizard Export: What Is Automatic

When you use **Copy JSON** in the wizard:
- Building metadata is included (`id`, `name`, `width`, `height`, `footprintTiles`)
- All image states are included
- Each uploaded image is embedded as `sourceDataUrl` (base64 data URL)
- POIs (named points) are included
- Ground plane settings are included

This means you can hand off a single JSON blob without placing separate image files.

When you use **Export Footprint PNG**:
- A neutral gray PNG with only the isometric footprint guide is generated
- Useful as a composition guide in external AI image tools

## Important Limits

Wizard export does not auto-insert the building into game code. You still need to:
1. Add the building definition
2. Add/render the visual in the renderer
3. Register scene logic if needed

Use `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ADDING_BUILDINGS.md` for that flow.

## Docs Index

- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/README.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/FOOTPRINT_ASSET_WIZARD.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ADDING_BUILDINGS.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/RENDERING_AND_DEPTH.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ADDING_TROOPS.md`
- `/Users/andreboufama/Documents/PersonalStuff/ clash/docs/ARCHITECTURE.md`
