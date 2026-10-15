import type { Room } from '../api-client/api';

export interface ValidationViolation {
  roomId: string;
  roomName: string;
  reason: string;
}

export function validateRoomPlacement(
  rooms: Room[],
  plotWidth: number,
  plotHeight: number
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  for (let i = 0; i < rooms.length; i++) {
    const r1 = rooms[i];
    // Bounds check
    if (r1.x < 0 || r1.y < 0 || r1.x + r1.width > plotWidth || r1.y + r1.height > plotHeight) {
      violations.push({
        roomId: i.toString(),
        roomName: r1.name,
        reason: 'Outside plot boundaries'
      });
    }

    // Overlap check
    for (let j = i + 1; j < rooms.length; j++) {
      const r2 = rooms[j];
      
      const overlapX = r1.x < r2.x + r2.width - 0.1 && r1.x + r1.width > r2.x + 0.1;
      const overlapY = r1.y < r2.y + r2.height - 0.1 && r1.y + r1.height > r2.y + 0.1;
      
      if (overlapX && overlapY) {
        violations.push({
          roomId: i.toString(),
          roomName: r1.name,
          reason: `Overlaps with ${r2.name}`
        });
      }
    }
  }

  return violations;
}
