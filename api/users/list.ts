import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  try {
    const storage = getStorage();
    const users = await storage.getAllUsers();
    const bases = await storage.getAllBases();
    const baseMap = new Map(bases.map((base) => [base.ownerId, base]));

    const usersWithBases = users.map((user) => {
      const base = baseMap.get(user.id);
      return {
        id: user.id,
        username: user.username,
        buildingCount: base ? base.buildings.length : 0,
        hasBase: !!base && base.buildings.length > 0,
      };
    });

    const validUsers = usersWithBases
      .filter((user) => user.hasBase)
      .sort((a, b) => b.buildingCount - a.buildingCount);

    return jsonOk(res, { success: true, users: validUsers });
  } catch (error) {
    console.error('List users error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
