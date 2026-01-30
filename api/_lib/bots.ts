import type { StoredBase } from './types.js';

const BOT_NAMES = [
  'Bot Village', 'Goblin Outpost', 'Skeleton Keep', 'Zombie Base',
  'Ghost Town', 'Dragon Lair', 'Orc Camp', 'Troll Den',
  'Witch Hut', 'Giant Fortress', 'Dark Castle', 'Haunted Manor'
];

export function generateBotBase(index: number): StoredBase {
  const botId = `bot_${index}_${Date.now()}`;
  const botName = BOT_NAMES[index % BOT_NAMES.length];
  const cx = 12;
  const cy = 12;
  const wallLevel = 1 + Math.floor(Math.random() * 3);

  const buildings: StoredBase['buildings'] = [];
  let buildingId = 0;

  buildings.push({
    id: `${botId}_b${buildingId++}`,
    type: 'town_hall',
    gridX: cx,
    gridY: cy,
    level: 1,
  });

  const defenseTypes = ['cannon', 'ballista', 'mortar', 'tesla', 'xbow'];
  const defensePositions = [
    { x: cx - 3, y: cy }, { x: cx + 4, y: cy },
    { x: cx, y: cy - 3 }, { x: cx, y: cy + 4 },
    { x: cx - 3, y: cy - 3 }, { x: cx + 4, y: cy + 4 },
  ];

  defensePositions.forEach((pos, i) => {
    const defType = defenseTypes[i % defenseTypes.length];
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: defType,
      gridX: pos.x,
      gridY: pos.y,
      level: 1 + Math.floor(Math.random() * 3),
    });
  });

  buildings.push({
    id: `${botId}_b${buildingId++}`,
    type: 'solana_collector',
    gridX: cx + 5,
    gridY: cy + 2,
    level: 2,
  });
  buildings.push({
    id: `${botId}_b${buildingId++}`,
    type: 'solana_collector',
    gridX: cx - 4,
    gridY: cy + 2,
    level: 2,
  });

  for (let i = -4; i <= 5; i += 1) {
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx + i,
      gridY: cy - 4,
      level: wallLevel,
    });
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx + i,
      gridY: cy + 5,
      level: wallLevel,
    });
  }
  for (let j = -3; j <= 4; j += 1) {
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx - 4,
      gridY: cy + j,
      level: wallLevel,
    });
    buildings.push({
      id: `${botId}_b${buildingId++}`,
      type: 'wall',
      gridX: cx + 5,
      gridY: cy + j,
      level: wallLevel,
    });
  }

  return {
    id: botId,
    ownerId: botId,
    username: botName,
    buildings,
    obstacles: [],
    resources: {
      sol: 60000 + Math.floor(Math.random() * 140000),
    },
    army: {},
    lastSaveTime: Date.now(),
    schemaVersion: 1,
    isBot: true,
  };
}
