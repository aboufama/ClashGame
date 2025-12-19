# Clash Isometric - MMO Architecture Roadmap

## 1. Vision & Goals
Transform the current single-player/local-storage game into a persistent MMO where:
- Users log in with accounts.
- Bases are persistent and stored in a cloud database.
- Users occupy a unique `(X, Y)` coordinate on an infinite global grid.
- Players can view a "World Map" of neighbors and interact/attack them.
- "Infinite Zoom" allows viewing hundreds of bases efficiently.

---

## 2. Tech Stack Definition
- **Frontend**: React + Phaser (Existing).
- **Backend**: Next.js API Routes (Serverless) or dedicated Node.js/NestJS server.
- **Database**: PostgreSQL (Supabase/Neon) or MongoDB. *Recommendation: PostgreSQL + PostGIS for spatial queries.*
- **Auth**: Supabase Auth, Clerk, or NextAuth (Credentials/OAuth).

---

## 3. Data Schema (Proposed)

### 3.1 `Users` Table
| Column | Type | Description |
|os|---|---|
| `id` | UUID | Primary Key |
| `username` | String | Unique display name |
| `email` | String | Unique email |
| `password_hash` | String | Hashed password |
| `created_at` | Timestamp | |

### 3.2 `Bases` Table (One-to-One with Users)
| Column | Type | Description |
|---|---|---|
| `user_id` | UUID | Foreign Key to Users |
| `grid_x` | Integer | Global X Coordinate |
| `grid_y` | Integer | Global Y Coordinate |
| `resources` | JSONB | e.g., `{"gold": 1000, "elixir": 5000}` |
| `last_active`| Timestamp | For implementing shields/decay |
| `trophies` | Integer | Ranking score |

### 3.3 `Buildings` Table
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary Key |
| `base_id` | UUID | Foreign Key to Bases |
| `type` | String | e.g., `'town_hall'`, `'cannon'` |
| `level` | Integer | Build level |
| `x` | Integer | Local Grid X (0-40) |
| `y` | Integer | Local Grid Y (0-40) |
| `meta` | JSONB | Rotation, status, upgrade_start_time |

---

## 4. World Grid System

### 4.1 Spiral Allocation Algorithm
To ensure users are tightly packed starting from `(0,0)`, use a Spiral Coordinate algorithm when a new user signs up:
1. Check `last_assigned_index` in a global config table.
2. Increment index.
3. Map integer index to `(x, y)` spiral coord:
   - Index 0 -> (0,0)
   - Index 1 -> (1,0)
   - Index 2 -> (1,1)
   - Index 3 -> (0,1)
   - ...etc.
4. Assign this `(x, y)` to the new Base.

### 4.2 Spatial Partitioning / Zoning
For the "Zoom Out" feature:
- **Chunking**: Divide the world into 10x10 Chunks.
- **Simplify**: When zoomed out, don't load `Buildings` table. Only load `Bases` table (Owner, Trophies, TownHall Level).
- Render a simplified sprite/icon for the base instead of the full Phaser Isometric view.

---

## 5. Implementation Phases

### Phase 1: authentication & Persistence (Transition from LocalStorage)
**Goal**: Replace `GameBackend.ts` `localStorage` with API calls.
1. Set up Next.js / Backend.
2. Create `/api/login` and `/api/register`.
3. Create `/api/base/load` and `/api/base/save`.
4. Refactor `GameBackend.ts` to be asynchronous:
   - `Backend.getWorld()` -> `await Backend.fetchWorld()`
   - `Backend.placeBuilding()` -> `await Backend.syncBuilding()`
5. **UI**: Add Login Screen overlay before game start.

### Phase 2: The Grid & Multiplayer View
**Goal**: See other players.
1. Implement `Spiral Allocation` on registration.
2. Create a generic "World Map" scene in Phaser.
   - Panning camera loads chunks of Base metadata.
   - Clicking a base preview enters "Scout Mode" (loads full `Buildings` data).
3. "Attack" button changes logic:
   - **Random**: Queries DB for `ORDER BY RANDOM() LIMIT 1` (or matchmaking ELO logic).
   - **Direct**: Attack the neighbor you clicked on.

### Phase 3: Optimizations & LOD (Level of Detail)
**Goal**: "See hundreds of bases".
1. **LOD System**:
   - Zoom Level 0 (Close): Full Isometric Render.
   - Zoom Level 1 (World): 2D Canvas tiles (Cached images of bases).
   - Zoom Level 2 (Strategic): Dots/Icons on a map.
2. **Caching**: Use Redis to cache the "World View" chunks since bases don't move often.

---

## 6. Codebase Readiness Checklist
- [x] **Modularity**: Data models separated from Logic (`GameBackend`, `Models`).
- [x] **Config**: centralized `GameDefinitions` and `GameText`.
- [x] **Upgrade Support**: Plumbing for `level` tracking and `getBuildingStats` hook is ready for "programmed" level data.
- [ ] **Async Support**: `GameBackend` methods are currently synchronous. Needs refactoring to Promises/Async-Await to support network requests.
- [ ] **Asset Management**: Need simplified assets for World Map view (e.g., "Tiny Town Hall" icon).

---

## 7. Building Upgrade Implementation (Real Levels)

The game is technically ready for real upgrades. To move away from the now-deleted "placeholder formula" and implement specific, hand-crafted levels (like the original Clash of Clans), follow this pattern:

### 7.1 Data Structure Updates
In `src/game/config/GameDefinitions.ts`, replace the flat stats with a level-based structure.

1. **Add a `levelData` map to `BuildingDef`**:
```typescript
export interface BuildingLevelStats {
    hp: number;
    damage?: number;
    productionRate?: number;
    cost: number;
    // ... any other stats that change per level
}

export interface BuildingDef {
    // ... base properties (id, name, width, height, maxCount)
    levels: BuildingLevelStats[]; // index 0 = Level 1, index 1 = Level 2, etc.
    maxLevel: number;
}
```

2. **Update `getBuildingStats(type, level)`**:
```typescript
export function getBuildingStats(type: BuildingType, level: number = 1): BuildingDef {
    const base = BUILDING_DEFINITIONS[type];
    const levelStats = base.levels ? base.levels[level - 1] : null;
    
    if (!levelStats) return base; // Fallback to Level 1
    
    return {
        ...base,
        maxHealth: levelStats.hp,
        damage: levelStats.damage ?? base.damage,
        productionRate: levelStats.productionRate ?? base.productionRate,
        cost: levelStats.cost
    };
}
```

### 7.2 Integration
- **InfoPanel.tsx**: This component already pulls "Next Level" stats via `getBuildingStats(type, level + 1)`. Once the `levels` array has data and `maxLevel` is increased, the UI will automatically activate the button and show the real Gold cost.
- **MainScene.ts**: The `drawBuildingVisuals` method receives the `level`. You can add logic there to switch between different "textures" (drawn via Graphics) for Level 1, Level 2, etc., providing visual progression.

