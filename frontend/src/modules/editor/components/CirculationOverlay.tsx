import React from 'react';
import type { FloorCirculation } from '../../../shared/api-client/api';

interface Props {
  /** Circulation data for the current floor from the backend */
  circulation: FloorCirculation | null;
  /** Whether to render the overlay at all */
  visible: boolean;
}

/**
 * CirculationOverlay
 *
 * Renders dashed walking paths from the entrance to every room as SVG
 * polylines. Unreachable rooms are highlighted with a warning indicator.
 *
 * Coordinate system: SVG units = feet, same as InteractiveBlueprint.
 * This component is rendered inside the same <svg> element as the blueprint.
 */
const CirculationOverlay: React.FC<Props> = React.memo(({ circulation, visible }) => {
  if (!visible || !circulation) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Walking path polylines */}
      {circulation.paths.map((path, i) => {
        const points = path.waypoints
          .map(([x, y]) => `${x},${y}`)
          .join(' ');

        if (!points) return null;

        return (
          <g key={i}>
            {/* Shadow / glow for readability */}
            <polyline
              points={points}
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={0.4}
              strokeDasharray="0.8 0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Main dashed path */}
            <polyline
              points={points}
              fill="none"
              stroke="#22c55e"
              strokeWidth={0.22}
              strokeDasharray="0.8 0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          </g>
        );
      })}

      {/* Waypoint dots at each junction */}
      {circulation.paths.flatMap((path, pi) =>
        path.waypoints.map(([x, y], wi) => (
          <circle
            key={`dot-${pi}-${wi}`}
            cx={x} cy={y} r={0.18}
            fill="#22c55e"
            opacity={0.7}
          />
        ))
      )}

    </g>
  );
});

CirculationOverlay.displayName = 'CirculationOverlay';
export default CirculationOverlay;
