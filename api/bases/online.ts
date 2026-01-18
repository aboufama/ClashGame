import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage } from '../_blobStorage.js';

// Bot base generator for when no real bases exist
function generateBotBase(index: number): any {
  const botNames = [
    'Bot Village', 'Goblin Outpost', 'Skeleton Keep', 'Zombie Base',
    'Ghost Town', 'Dragon Lair', 'Orc Camp', 'Troll Den',
    'Witch Hut', 'Giant Fortress', 'Dark Castle', 'Haunted Manor'
  ];

  const botId = `bot_${index}_${Date.now()}`;
  const botName = botNames[index % botNames.length];
  const cx = 12;
  const cy = 12;

  // Random wall level 1-3
  const wallLevel = 1 + Math.floor(Math.random() * 3);

  // Generate bot buildings
  const buildings: any[] = [];
  let buildingId = 0;

  // Town Hall at center
  buildings.push({
    id: `${botId}_b${buildingId++}`,
    type: 'town_hall',
    gridX: cx,
    gridY: cy,
    level: 1
  });

  // Defenses around TH
  const defenseTypes = ['cannon', 'ballista', 'mortar', 'tesla', 'xbow'];
  const defensePositions = [
    { x: cx - 3, y: cy }, { x: cx + 4, y: cy },
    { x: cx, y: cy - 3 }, { x: cx, y: cy + 4 },
    { x: cx - 3, y: cy - 3 }, { x: cx + 4, y: cy + 4 }
  ];

  defensePositions.forEach((pos, i) => {
    const defType = defenseTypes[i % defenseTypes.length];
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: defType,
      gridX: pos.x,
      gridY: pos.y,
      level: 1 + Math.floor(Math.random() * 3)
    });
  });

  // Resources
  buildings.push({
    id: `${botId}_b${buildingId++}`,
    type: 'mine',
    gridX: cx + 5,
    gridY: cy + 2,
    level: 2
  });
  buildings.push({
    id: `${botId}_b${buildingId++}`,
    type: 'elixir_collector',
    gridX: cx - 4,
    gridY: cy + 2,
    level: 2
  });

  // Walls around center
  for (let i = -4; i <= 5; i++) {
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx + i,
      gridY: cy - 4,
      level: wallLevel
    });
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx + i,
      gridY: cy + 5,
      level: wallLevel
    });
  }
  for (let j = -3; j <= 4; j++) {
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx - 4,
      gridY: cy + j,
      level: wallLevel
    });
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx + 5,
      gridY: cy + j,
      level: wallLevel
    });
  }

  return {
    id: botId,
    ownerId: botId,
    username: botName,
    buildings,
    obstacles: [],
    resources: {
      gold: 30000 + Math.floor(Math.random() * 70000),
      elixir: 30000 + Math.floor(Math.random() * 70000)
    },
    army: {},
    lastSaveTime: Date.now(),
    isBot: true
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const excludeUserId = req.query.excludeUserId as string;
    const limit = parseInt(req.query.limit as string) || 5;

    // Get real online bases
    let bases = await Storage.getOnlineBases(excludeUserId || '', limit);

    // If no real bases, generate bot bases
    if (bases.length === 0) {
      const botCount = Math.min(limit, 5);
      for (let i = 0; i < botCount; i++) {
        bases.push(generateBotBase(i));
      }
    }

    // Filter out bases with no buildings or just walls
    bases = bases.filter(base => {
      const nonWallBuildings = base.buildings.filter((b: any) => b.type !== 'wall');
      return nonWallBuildings.length > 0;
    });

    // If still no valid bases, create at least one bot
    if (bases.length === 0) {
      bases.push(generateBotBase(0));
    }

    // Return a random base from the available ones
    const randomIndex = Math.floor(Math.random() * bases.length);
    const selectedBase = bases[randomIndex];

    return res.status(200).json({
      success: true,
      base: selectedBase,
      totalAvailable: bases.length
    });
  } catch (error) {
    console.error('Get online bases error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
