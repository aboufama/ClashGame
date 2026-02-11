# Local Building Studio (No Server)

Open this file directly in your browser:

- `/Users/andreboufama/Documents/PersonalStuff/ clash/tools/local-dev-studio.html`

No npm, no Vite, no localhost required.

## What this simplified version does

- Image building tool only (defense studio removed)
- Isometric `64x32` map using game-matched grass shading from `MainScene.drawIsoTile`
- Blue footprint outline only (no blockers, no red/green placement states)
- Building placement like game feel:
  - drag blue footprint to move placement
  - click map tile to place footprint top-left there
- Image drag is always active when grabbing the image
- Auto-fit scales and re-centers image anchor to the footprint center
- Pixel preview toggle uses fixed game default (`1.5`) and only affects canvas (UI text stays sharp)
- Export JSON + TS snippet
