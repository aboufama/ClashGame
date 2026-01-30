export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
  lastLogin: number;
}

export interface StoredBuilding {
  id: string;
  type: string;
  gridX: number;
  gridY: number;
  level: number;
}

export interface StoredObstacle {
  id: string;
  type: string;
  gridX: number;
  gridY: number;
}

export interface StoredBase {
  id: string;
  ownerId: string;
  username: string;
  buildings: StoredBuilding[];
  obstacles?: StoredObstacle[];
  resources: { sol: number };
  army?: Record<string, number>;
  lastSaveTime: number;
  schemaVersion?: number;
  isBot?: boolean;
}

export interface AttackNotification {
  id: string;
  victimId: string;
  attackerId: string;
  attackerName: string;
  solLost: number;
  destruction: number;
  attackId?: string;
  timestamp: number;
  read: boolean;
}

export interface BaseSummary {
  ownerId: string;
  username: string;
  buildingCount: number;
  nonWallCount: number;
  lastSaveTime: number;
}
