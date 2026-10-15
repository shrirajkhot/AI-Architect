import React from 'react';
import type { Room, SunlightResult } from '../../../shared/api-client/api';

interface Props {
  rooms: Room[];
  sunlightResult?: SunlightResult;
  visible: boolean;
  floorIndex: number;
}

const SunlightOverlay: React.FC<Props> = React.memo(({ rooms, sunlightResult, visible, floorIndex }) => {
  if (!visible || !sunlightResult) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {rooms.map((room) => {
        if (!room.windows) return null;

        return room.windows.map((window, wIdx) => {
          // Identify the sunlight data for this window
          const key = `${floorIndex}_${room.name}_${window.wall}_${wIdx}`;
          const sunData = sunlightResult.windows_sunlight?.[key];
          
          if (!sunData || sunData.intensity <= 0) return null;

          // Determine window exact coordinates in SVG space
          // Window position is along the wall (start edge), so we add window.width / 2 to get the center
          const wHalf = (window.width ?? 3) / 2;
          let wx = room.x;
          let wy = room.y;
          let dx = 0;
          let dy = 0;

          if (window.wall === 'top') {
            wx = room.x + (window.position ?? 0) + wHalf;
            wy = room.y;
            dx = 0;
            dy = 1; // Sun rays go down into the room
          } else if (window.wall === 'bottom') {
            wx = room.x + (window.position ?? 0) + wHalf;
            wy = room.y + room.height;
            dx = 0;
            dy = -1; // Sun rays go up into the room
          } else if (window.wall === 'left') {
            wx = room.x;
            wy = room.y + (window.position ?? 0) + wHalf;
            dx = 1;
            dy = 0; // Sun rays go right into the room
          } else if (window.wall === 'right') {
            wx = room.x + room.width;
            wy = room.y + (window.position ?? 0) + wHalf;
            dx = -1;
            dy = 0; // Sun rays go left into the room
          }

          // Length of the ray based on intensity (max ~ 4 feet)
          const rayLength = Math.max(1, (sunData.intensity / 100) * 4);
          
          let p1x = wx; let p1y = wy;
          let p2x = wx; let p2y = wy;
          
          if (window.wall === 'top' || window.wall === 'bottom') {
            p1x = wx - wHalf; p2x = wx + wHalf;
          } else {
            p1y = wy - wHalf; p2y = wy + wHalf;
          }

          // Spread out the light at the end of the ray
          const spread = 0.5;
          let p3x = p2x + dx * rayLength;
          let p3y = p2y + dy * rayLength;
          let p4x = p1x + dx * rayLength;
          let p4y = p1y + dy * rayLength;

          if (window.wall === 'top' || window.wall === 'bottom') {
            p3x += spread; p4x -= spread;
          } else {
            p3y += spread; p4y -= spread;
          }

          const points = `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`;

          // Color based on intensity and direction
          let color = 'rgba(253, 224, 71, 0.4)'; // Yellow-300 default
          if (sunData.direction === 'East') color = 'rgba(251, 146, 60, 0.5)'; // Orange-400 morning
          else if (sunData.direction === 'West') color = 'rgba(248, 113, 113, 0.4)'; // Red-400 evening
          else if (sunData.direction === 'South') color = 'rgba(250, 204, 21, 0.5)'; // Yellow-400 noon

          return (
            <polygon
              key={key}
              points={points}
              fill={color}
            />
          );
        });
      })}
    </g>
  );
});

SunlightOverlay.displayName = 'SunlightOverlay';
export default SunlightOverlay;
