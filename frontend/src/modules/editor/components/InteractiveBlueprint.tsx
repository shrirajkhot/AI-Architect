import React, { useState, useRef } from 'react';
import type { Room, FloorCirculation, SunlightResult } from '../../../shared/api-client/api';
import CirculationOverlay from './CirculationOverlay';
import SunlightOverlay from './SunlightOverlay';
import { validateRoomPlacement } from '../../../shared/utils/validateRooms';
import { toast } from 'react-hot-toast';

interface Props {
  rooms: Room[];
  selectedRoom: Room | null;
  onRoomSelect?: (room: Room, index: number) => void;
  onRoomDrop?: (updatedRooms: Room[], imageUrl?: string) => void;
  circulation?: FloorCirculation | null;
  showCirculation?: boolean;
  sunlightResult?: SunlightResult | null;
  showSunlight?: boolean;
  entryDir?: string;
  plotWidth?: number;
  plotHeight?: number;
  floorIndex?: number;
}

// Professional 2D CAD clean white color scheme per room type
function getRoomStyle(name: string): { fill: string; stroke: string; labelColor: string; icon: string } {
  const n = name.toLowerCase();
  if (n.includes('master') || (n.includes('bedroom') && n.includes('1')))
    return { fill: '#EFF6FF', stroke: '#3B82F6', labelColor: '#1E3A8A', icon: '🛏' };
  if (n.includes('bedroom'))
    return { fill: '#F0FDF4', stroke: '#22C55E', labelColor: '#14532D', icon: '🛏' };
  if (n.includes('bath') || n.includes('toilet') || n.includes('wc'))
    return { fill: '#ECFEFF', stroke: '#06B6D4', labelColor: '#164E63', icon: '🚽' };
  if (n.includes('kitchen'))
    return { fill: '#FEFCE8', stroke: '#EAB308', labelColor: '#713F12', icon: '🍳' };
  if (n.includes('living') || n.includes('lounge'))
    return { fill: '#FAF5FF', stroke: '#A855F7', labelColor: '#581C87', icon: '🛋' };
  if (n.includes('dining'))
    return { fill: '#FDF2F8', stroke: '#EC4899', labelColor: '#831843', icon: '🍽' };
  if (n.includes('balcony') || n.includes('terrace'))
    return { fill: '#F0FDFA', stroke: '#14B8A6', labelColor: '#134E4A', icon: '🌿' };
  if (n.includes('stair'))
    return { fill: '#FFFBEB', stroke: '#F59E0B', labelColor: '#78350F', icon: '◤' };
  if (n.includes('parking') || n.includes('garage'))
    return { fill: '#F1F5F9', stroke: '#64748B', labelColor: '#0F172A', icon: '🚗' };
  if (n.includes('hall') || n.includes('lobby') || n.includes('foyer') || n.includes('entrance'))
    return { fill: '#FFF7ED', stroke: '#F97316', labelColor: '#7C2D12', icon: '🚪' };
  if (n.includes('corridor'))
    return { fill: '#F8FAFC', stroke: '#94A3B8', labelColor: '#334155', icon: '' };
  if (n.includes('store') || n.includes('utility') || n.includes('laundry'))
    return { fill: '#F4F4F5', stroke: '#71717A', labelColor: '#27272A', icon: '📦' };
  if (n.includes('landing'))
    return { fill: '#FAFAFA', stroke: '#A3A3A3', labelColor: '#404040', icon: '' };
  return { fill: '#FFFFFF', stroke: '#CBD5E1', labelColor: '#334155', icon: '◻' };
}

// Draw a simple furniture symbol inside a room
function FurnitureSymbol({ room, cx, cy }: { room: Room; cx: number; cy: number }) {
  const n = room.name.toLowerCase();
  const strokeW = 0.12;
  const stroke = '#94a3b8';

  if (n.includes('bedroom') || n.includes('master')) {
    // Simple bed rectangle
    const bw = Math.min(room.width * 0.55, 6);
    const bh = Math.min(room.height * 0.45, 4.5);
    return (
      <g>
        <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh}
          fill="white" stroke={stroke} strokeWidth={strokeW} rx={0.2} />
        <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh * 0.28}
          fill="#cbd5e1" stroke={stroke} strokeWidth={strokeW} rx={0.2} />
        <circle cx={cx - bw * 0.18} cy={cy - bh * 0.14} r={bh * 0.12}
          fill="#e2e8f0" stroke={stroke} strokeWidth={strokeW} />
        <circle cx={cx + bw * 0.18} cy={cy - bh * 0.14} r={bh * 0.12}
          fill="#e2e8f0" stroke={stroke} strokeWidth={strokeW} />
      </g>
    );
  }
  if (n.includes('living') || n.includes('lounge')) {
    // Simple sofa L-shape
    const sw = Math.min(room.width * 0.6, 7);
    const sh = Math.min(room.height * 0.35, 3);
    return (
      <g>
        <rect x={cx - sw / 2} y={cy} width={sw} height={sh}
          fill="white" stroke={stroke} strokeWidth={strokeW} rx={0.3} />
        <rect x={cx - sw / 2} y={cy} width={sw * 0.18} height={sh}
          fill="#e2e8f0" stroke={stroke} strokeWidth={strokeW} rx={0.3} />
        <rect x={cx + sw / 2 - sw * 0.18} y={cy} width={sw * 0.18} height={sh}
          fill="#e2e8f0" stroke={stroke} strokeWidth={strokeW} rx={0.3} />
        <rect x={cx - sw * 0.2} y={cy - sh * 0.7} width={sw * 0.4} height={sh * 0.6}
          fill="white" stroke={stroke} strokeWidth={strokeW} rx={0.2} />
      </g>
    );
  }
  if (n.includes('kitchen')) {
    // Counter/sink symbol
    const kw = Math.min(room.width * 0.65, 6);
    const kh = Math.min(room.height * 0.25, 2);
    return (
      <g>
        <rect x={cx - kw / 2} y={cy + room.height * 0.15} width={kw} height={kh}
          fill="white" stroke={stroke} strokeWidth={strokeW} />
        <circle cx={cx - kw * 0.15} cy={cy + room.height * 0.15 + kh / 2} r={kh * 0.32}
          fill="none" stroke={stroke} strokeWidth={strokeW} />
        <rect x={cx + kw * 0.05} y={cy + room.height * 0.15 + kh * 0.15} width={kw * 0.35} height={kh * 0.7}
          fill="#e2e8f0" stroke={stroke} strokeWidth={strokeW} rx={0.1} />
      </g>
    );
  }
  if (n.includes('bath') || n.includes('toilet') || n.includes('wc')) {
    // Toilet + bath symbol
    const bw = Math.min(room.width * 0.45, 3.5);
    const bh = Math.min(room.height * 0.55, 4.5);
    return (
      <g>
        <ellipse cx={cx - room.width * 0.12} cy={cy + room.height * 0.05} rx={bw * 0.35} ry={bh * 0.28}
          fill="white" stroke={stroke} strokeWidth={strokeW} />
        <ellipse cx={cx - room.width * 0.12} cy={cy + room.height * 0.05} rx={bw * 0.2} ry={bh * 0.16}
          fill="#e0f4f7" stroke={stroke} strokeWidth={strokeW * 0.7} />
        <rect x={cx + room.width * 0.08} y={cy - room.height * 0.2} width={bw * 0.7} height={bh * 0.55}
          fill="white" stroke={stroke} strokeWidth={strokeW} rx={bw * 0.15} />
      </g>
    );
  }
  if (n.includes('dining')) {
    // Round table + chairs
    const r = Math.min(room.width, room.height) * 0.22;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke={stroke} strokeWidth={strokeW} />
        {[0, 90, 180, 270].map(angle => {
          const rad = (angle * Math.PI) / 180;
          const chx = cx + (r + r * 0.55) * Math.cos(rad);
          const chy = cy + (r + r * 0.55) * Math.sin(rad);
          return <circle key={angle} cx={chx} cy={chy} r={r * 0.3}
            fill="white" stroke={stroke} strokeWidth={strokeW} />;
        })}
      </g>
    );
  }
  return null;
}

// Color palette per furniture type — defined outside component to avoid recreation
function getFurnFill(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bed'))                                      return '#c8daf0';
  if (n.includes('sofa') || n.includes('couch'))             return '#c4baf2';
  if (n.includes('dining table') || n.includes('coffee table')) return '#f0d8a0';
  if (n.includes('wardrobe') || n.includes('cabinet'))       return '#c0d4b8';
  if (n.includes('toilet') || n.includes('bath') || n.includes('shower')) return '#b0d8e8';
  if (n.includes('island') || n.includes('counter'))         return '#f0e0b0';
  if (n.includes('desk') || n.includes('study chair'))       return '#d0e8c0';
  if (n.includes('tv'))                                       return '#303840';
  if (n.includes('car'))                                      return '#b0c0d8';
  if (n.includes('plant') || n.includes('pot'))              return '#a0d0a0';
  if (n.includes('shelf') || n.includes('bookshelf'))        return '#c8b888';
  return '#d4dce8';
}

// ── Coordinate Furniture Renderer ────────────────────────────────────────────
// Draws detailed top-down 2D representations of furniture
function renderDetailedFurniture(name: string, x: number, y: number, w: number, h: number, fill: string, stroke: string) {
  const n = name.toLowerCase();
  const isHoriz = w > h;
  
  if (n.includes('bed')) {
    const pW = isHoriz ? w * 0.15 : w * 0.35;
    const pH = isHoriz ? h * 0.35 : h * 0.15;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={0.12} rx={0.2} />
        {isHoriz ? (
          <line x1={x + w * 0.3} y1={y} x2={x + w * 0.3} y2={y + h} stroke={stroke} strokeWidth={0.08} />
        ) : (
          <line x1={x} y1={y + h * 0.3} x2={x + w} y2={y + h * 0.3} stroke={stroke} strokeWidth={0.08} />
        )}
        {isHoriz ? (
          <>
            <rect x={x + w*0.08} y={y + h*0.1} width={pW} height={pH} fill="#ffffff" stroke={stroke} strokeWidth={0.08} rx={0.1} />
            <rect x={x + w*0.08} y={y + h*0.55} width={pW} height={pH} fill="#ffffff" stroke={stroke} strokeWidth={0.08} rx={0.1} />
          </>
        ) : (
          <>
            <rect x={x + w*0.1} y={y + h*0.08} width={pW} height={pH} fill="#ffffff" stroke={stroke} strokeWidth={0.08} rx={0.1} />
            <rect x={x + w*0.55} y={y + h*0.08} width={pW} height={pH} fill="#ffffff" stroke={stroke} strokeWidth={0.08} rx={0.1} />
          </>
        )}
      </g>
    );
  }
  
  if (n.includes('sofa') || n.includes('couch')) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={0.12} rx={0.2} />
        {isHoriz ? (
          <>
            <rect x={x} y={y} width={w} height={h*0.3} fill="rgba(0,0,0,0.08)" stroke={stroke} strokeWidth={0.08} rx={0.1} />
            <rect x={x} y={y+h*0.3} width={w*0.15} height={h*0.7} fill="rgba(0,0,0,0.08)" stroke={stroke} strokeWidth={0.08} rx={0.1} />
            <rect x={x+w*0.85} y={y+h*0.3} width={w*0.15} height={h*0.7} fill="rgba(0,0,0,0.08)" stroke={stroke} strokeWidth={0.08} rx={0.1} />
          </>
        ) : (
          <>
            <rect x={x+w*0.7} y={y} width={w*0.3} height={h} fill="rgba(0,0,0,0.08)" stroke={stroke} strokeWidth={0.08} rx={0.1} />
            <rect x={x} y={y} width={w*0.7} height={h*0.15} fill="rgba(0,0,0,0.08)" stroke={stroke} strokeWidth={0.08} rx={0.1} />
            <rect x={x} y={y+h*0.85} width={w*0.7} height={h*0.15} fill="rgba(0,0,0,0.08)" stroke={stroke} strokeWidth={0.08} rx={0.1} />
          </>
        )}
      </g>
    );
  }
  
  if (n.includes('dining table')) {
    const rx = isHoriz ? w*0.1 : h*0.1;
    return (
      <g>
        {isHoriz ? (
          <>
            <circle cx={x + w*0.25} cy={y} r={h*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
            <circle cx={x + w*0.75} cy={y} r={h*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
            <circle cx={x + w*0.25} cy={y + h} r={h*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
            <circle cx={x + w*0.75} cy={y + h} r={h*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
          </>
        ) : (
          <>
            <circle cx={x} cy={y + h*0.25} r={w*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
            <circle cx={x} cy={y + h*0.75} r={w*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
            <circle cx={x + w} cy={y + h*0.25} r={w*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
            <circle cx={x + w} cy={y + h*0.75} r={w*0.18} fill="#ffffff" stroke={stroke} strokeWidth={0.08} />
          </>
        )}
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={0.12} rx={rx} />
      </g>
    );
  }

  return <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={0.12} rx={0.15} />;
}

function FurnitureLayer({ room }: { room: Room }) {
  const items = room.furniture;

  // ── Fallback: symbolic shapes for rooms with no LLM furniture data ──────────
  if (!items || items.length === 0) {
    return <FurnitureSymbol room={room} cx={room.x + room.width / 2} cy={room.y + room.height / 2} />;
  }

  return (
    <g>
      {items.map((furn, idx) => {
        // Convert room-relative coords to absolute SVG coords
        const ax = room.x + furn.x;
        const ay = room.y + furn.y;
        const fw = furn.width;
        const fh = furn.height;
        const fcx = ax + fw / 2;
        const fcy = ay + fh / 2;
        const labelSize = Math.max(0.5, Math.min(fw, fh) * 0.15);
        const fill = getFurnFill(furn.name);
        const stroke = "rgba(90,110,150,0.7)";

        return (
          <g key={idx} style={{ pointerEvents: 'none' }}>
            {renderDetailedFurniture(furn.name, ax, ay, fw, fh, fill, stroke)}
            {/* Furniture name label */}
            {fw > 2 && fh > 1.5 && (
              <text
                x={fcx} y={fcy}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={labelSize}
                fontFamily="Inter, system-ui, sans-serif"
                fontWeight="500"
                fill="rgba(40,55,90,0.85)"
                style={{ userSelect: 'none' }}
              >
                {furn.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}


function DoorArcs({ room, doorAttributes }: { room: Room, doorAttributes: { claims: Map<string, string>, stairs: Set<string> } }) {
  if (!room.doors || room.doors.length === 0) return null;

  return (
    <g>
      {room.doors.map((door, idx) => {
        const getDoorGeometry = () => {
          const rawDw = door.width || 3;
          const pos = door.position || 0;

          if (door.wall === 'top') {
            const dw = Math.min(rawDw, room.width - pos, room.height * 0.75);
            const hx = room.x + pos;
            const hy = room.y;
            return {
              dw, hx, hy,
              gapX1: hx, gapY1: hy, gapX2: hx + dw, gapY2: hy,
              leafX: hx, leafY: hy + dw,
              arcEndX: hx + dw, arcEndY: hy,
              sweepFlag: 1
            };
          }
          if (door.wall === 'bottom') {
            const dw = Math.min(rawDw, room.width - pos, room.height * 0.75);
            const hx = room.x + pos;
            const hy = room.y + room.height;
            return {
              dw, hx, hy,
              gapX1: hx, gapY1: hy, gapX2: hx + dw, gapY2: hy,
              leafX: hx, leafY: hy - dw,
              arcEndX: hx + dw, arcEndY: hy,
              sweepFlag: 0
            };
          }
          if (door.wall === 'left') {
            const dw = Math.min(rawDw, room.height - pos, room.width * 0.75);
            const hx = room.x;
            const hy = room.y + pos;
            return {
              dw, hx, hy,
              gapX1: hx, gapY1: hy, gapX2: hx, gapY2: hy + dw,
              leafX: hx + dw, leafY: hy,
              arcEndX: hx, arcEndY: hy + dw,
              sweepFlag: 1
            };
          }
          if (door.wall === 'right') {
            const dw = Math.min(rawDw, room.height - pos, room.width * 0.75);
            const hx = room.x + room.width;
            const hy = room.y + pos;
            return {
              dw, hx, hy,
              gapX1: hx, gapY1: hy, gapX2: hx, gapY2: hy + dw,
              leafX: hx - dw, leafY: hy,
              arcEndX: hx, arcEndY: hy + dw,
              sweepFlag: 0
            };
          }
          return null;
        };

        const geom = getDoorGeometry();
        if (!geom || geom.dw <= 0) return null;

        const { hx, hy, leafX, leafY, dw, sweepFlag, arcEndX, arcEndY, gapX1, gapY1, gapX2, gapY2 } = geom;

        // Compute exact world coordinates of the hinge
        const hingeX = (door.wall === 'left' || door.wall === 'right') 
          ? (door.wall === 'left' ? room.x : room.x + room.width) 
          : hx;
        const hingeY = (door.wall === 'top' || door.wall === 'bottom')
          ? (door.wall === 'top' ? room.y : room.y + room.height)
          : hy;
        
        const key = `${Math.round(hingeX * 10)},${Math.round(hingeY * 10)}`;
        const isDrawn = doorAttributes.claims.get(key) !== room.name;
        const isStairDoor = doorAttributes.stairs.has(key);

        return (
          <g key={`door-${idx}`}>
            {/* White gap in wall = door opening */}
            <line x1={gapX1} y1={gapY1} x2={gapX2} y2={gapY2}
              stroke="#fafbfc" strokeWidth={0.65} />
            
            {!isDrawn && !isStairDoor && (
              <>
                <path d={`M ${hx} ${hy} L ${leafX} ${leafY} A ${dw} ${dw} 0 0 ${sweepFlag} ${arcEndX} ${arcEndY}`}
                  fill="rgba(100,116,139,0.12)" stroke="#64748b" strokeWidth={0.12} strokeDasharray="0.4 0.2" />
                <line x1={hx} y1={hy} x2={leafX} y2={leafY} stroke="#475569" strokeWidth={0.24} />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}


// Window marks on exterior walls — driven by room.windows[] from backend.
// Draws the standard architectural window symbol: double line (glass pane) + end ticks.
function WindowMarks({ room }: { room: Room }) {
  const wins = room.windows;
  // No windows data → nothing to draw (no invented defaults)
  if (!wins || wins.length === 0) return null;

  return (
    <g>
      {wins.map((w, idx) => {
        const pos = w.position ?? 0;
        const ww  = w.width ?? 3;

        // Pure declarative geometry — returns null if wall is unknown
        const geom = (() => {
          const TICK = 0.35;
          const GLASS = 0.18;
          if (w.wall === 'top') {
            const x1 = room.x + pos, y1 = room.y, x2 = room.x + pos + ww, y2 = room.y;
            return { x1, y1, x2, y2, gx1: x1, gy1: y1 + GLASS, gx2: x2, gy2: y2 + GLASS,
              t1: [x1, y1 - TICK, x1, y1 + TICK] as const, t2: [x2, y2 - TICK, x2, y2 + TICK] as const };
          }
          if (w.wall === 'bottom') {
            const x1 = room.x + pos, y1 = room.y + room.height, x2 = room.x + pos + ww, y2 = room.y + room.height;
            return { x1, y1, x2, y2, gx1: x1, gy1: y1 - GLASS, gx2: x2, gy2: y2 - GLASS,
              t1: [x1, y1 - TICK, x1, y1 + TICK] as const, t2: [x2, y2 - TICK, x2, y2 + TICK] as const };
          }
          if (w.wall === 'left') {
            const x1 = room.x, y1 = room.y + pos, x2 = room.x, y2 = room.y + pos + ww;
            return { x1, y1, x2, y2, gx1: x1 + GLASS, gy1: y1, gx2: x2 + GLASS, gy2: y2,
              t1: [x1 - TICK, y1, x1 + TICK, y1] as const, t2: [x2 - TICK, y2, x2 + TICK, y2] as const };
          }
          if (w.wall === 'right') {
            const x1 = room.x + room.width, y1 = room.y + pos, x2 = room.x + room.width, y2 = room.y + pos + ww;
            return { x1, y1, x2, y2, gx1: x1 - GLASS, gy1: y1, gx2: x2 - GLASS, gy2: y2,
              t1: [x1 - TICK, y1, x1 + TICK, y1] as const, t2: [x2 - TICK, y2, x2 + TICK, y2] as const };
          }
          return null;
        })();

        if (!geom) return null;
        const { x1, y1, x2, y2, gx1, gy1, gx2, gy2, t1, t2 } = geom;

        return (
          <g key={`win-${room.name}-${idx}`}>
            {/* White gap on wall (matches door gap style) */}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#fafbfc" strokeWidth={0.55} />
            {/* Outer window line (wall face) */}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#60a5fa" strokeWidth={0.22} />
            {/* Inner glass line */}
            <line x1={gx1} y1={gy1} x2={gx2} y2={gy2}
              stroke="#60a5fa" strokeWidth={0.12} strokeDasharray="0.3 0.15" />
            {/* End ticks */}
            <line x1={t1[0]} y1={t1[1]} x2={t1[2]} y2={t1[3]}
              stroke="#60a5fa" strokeWidth={0.18} />
            <line x1={t2[0]} y1={t2[1]} x2={t2[2]} y2={t2[3]}
              stroke="#60a5fa" strokeWidth={0.18} />
          </g>
        );
      })}
    </g>
  );
}

const InteractiveBlueprint: React.FC<Props> = React.memo(({ rooms, selectedRoom, onRoomSelect, onRoomDrop, circulation, showCirculation, sunlightResult, showSunlight, entryDir = 'north', plotWidth, plotHeight,
  floorIndex = 0,
}) => {
  // Drag overlay: only maintain local state during an active drag.
  // When not dragging, the parent prop is the source of truth (no sync needed).
  const [dragRooms, setDragRooms] = useState<Room[] | null>(null);
  const displayRooms = dragRooms ?? rooms;

  const [draggingRoomIndex, setDraggingRoomIndex] = useState<number | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<'top' | 'right' | 'bottom' | 'left' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | null>(null);
  const dragOriginalRooms = useRef<Room[] | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Global map to deduplicate door swing drawing across adjacent rooms purely (Strict Mode safe)
  const doorAttributes = React.useMemo(() => {
    const claims = new Map<string, string>();
    const stairs = new Set<string>();
    
    displayRooms.forEach(room => {
      // Only suppress door arcs ON the staircase room itself — not on neighbours like Balcony/Landing
      const isStairRoom = room.name.toLowerCase().includes('stair');
      room.doors?.forEach(door => {
        const pos = door.position || 0;
        let hx = 0, hy = 0;
        if (door.wall === 'top') { hx = room.x + pos; hy = room.y; }
        else if (door.wall === 'bottom') { hx = room.x + pos; hy = room.y + room.height; }
        else if (door.wall === 'left') { hx = room.x; hy = room.y + pos; }
        else if (door.wall === 'right') { hx = room.x + room.width; hy = room.y + pos; }
        
        const hingeX = (door.wall === 'left' || door.wall === 'right') ? (door.wall === 'left' ? room.x : room.x + room.width) : hx;
        const hingeY = (door.wall === 'top' || door.wall === 'bottom') ? (door.wall === 'top' ? room.y : room.y + room.height) : hy;
        
        const key = `${Math.round(hingeX * 10)},${Math.round(hingeY * 10)}`;
        
        // Only mark as stair door if the door belongs to the Staircase room itself
        if (isStairRoom) stairs.add(key);
        
        if (!claims.has(key)) claims.set(key, room.name);
      });
    });
    return { claims, stairs };
  }, [displayRooms]);

  const getSvgCoordinates = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  };

  const handlePointerDown = (e: React.PointerEvent, _room: Room, index: number, edge?: 'top' | 'right' | 'bottom' | 'left' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight') => {
    setDraggingRoomIndex(index);
    setDraggingEdge(edge || null);
    setDragRooms(rooms); // snapshot current rooms as drag base
    dragOriginalRooms.current = JSON.parse(JSON.stringify(rooms));
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStartPos.current = getSvgCoordinates(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingRoomIndex === null || !dragOriginalRooms.current) return;
    const currentPos = getSvgCoordinates(e.clientX, e.clientY);
    
    // Calculate total movement since the drag started
    const totalDx = currentPos.x - dragStartPos.current.x;
    const totalDy = currentPos.y - dragStartPos.current.y;

    if (!draggingEdge) {
      return; // Room box dragging disabled in favor of vertex/wall dragging
    } else {
      // Wall dragging logic: Resize target room AND adjacent rooms sharing this wall
      const dx = Math.round(totalDx * 2) / 2;
      const dy = Math.round(totalDy * 2) / 2;

      const newRooms = JSON.parse(JSON.stringify(dragOriginalRooms.current)) as Room[];
      const targetRoom = newRooms[draggingRoomIndex];
      const origTarget = dragOriginalRooms.current[draggingRoomIndex];

      let sharedX: number | null = null;
      let sharedY: number | null = null;
      let newSharedX: number | null = null;
      let newSharedY: number | null = null;

      if (draggingEdge?.includes('right')) {
        targetRoom.width = Math.max(2, origTarget.width + dx);
        sharedX = origTarget.x + origTarget.width;
        newSharedX = targetRoom.x + targetRoom.width;
      } else if (draggingEdge?.includes('left')) {
        const shift = Math.min(origTarget.width - 2, dx);
        targetRoom.x = origTarget.x + shift;
        targetRoom.width = origTarget.width - shift;
        sharedX = origTarget.x;
        newSharedX = targetRoom.x;
      }
      
      if (draggingEdge?.includes('bottom')) {
        targetRoom.height = Math.max(2, origTarget.height + dy);
        sharedY = origTarget.y + origTarget.height;
        newSharedY = targetRoom.y + targetRoom.height;
      } else if (draggingEdge?.includes('top')) {
        const shift = Math.min(origTarget.height - 2, dy);
        targetRoom.y = origTarget.y + shift;
        targetRoom.height = origTarget.height - shift;
        sharedY = origTarget.y;
        newSharedY = targetRoom.y;
      }

      // Move ALL rooms that shared the original wall axis
      for (let i = 0; i < newRooms.length; i++) {
        if (i === draggingRoomIndex) continue;
        const r = newRooms[i];
        const origR = dragOriginalRooms.current[i];
        let modified = false;
        const EPSILON = 0.5;

        if (sharedX !== null && newSharedX !== null) {
           if (Math.abs(origR.x - sharedX) <= EPSILON) {
               r.x = newSharedX;
               r.width = origR.width - (r.x - origR.x);
               modified = true;
           }
           if (Math.abs(origR.x + origR.width - sharedX) <= EPSILON) {
               r.width = newSharedX - r.x;
               modified = true;
           }
        }

        if (sharedY !== null && newSharedY !== null) {
           if (Math.abs(origR.y - sharedY) <= EPSILON) {
               r.y = newSharedY;
               r.height = origR.height - (r.y - origR.y);
               modified = true;
           }
           if (Math.abs(origR.y + origR.height - sharedY) <= EPSILON) {
               r.height = newSharedY - r.y;
               modified = true;
           }
        }

        if (modified) {
           if (r.width < 2) { r.x -= (2 - r.width); r.width = 2; }
           if (r.height < 2) { r.y -= (2 - r.height); r.height = 2; }
        }
      }

      setDragRooms(newRooms);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingRoomIndex !== null) {
      setDraggingRoomIndex(null);
      setDraggingEdge(null);
      (e.target as Element).releasePointerCapture(e.pointerId);
      
      if (dragRooms && plotWidth && plotHeight) {
        const violations = validateRoomPlacement(dragRooms, plotWidth, plotHeight);
        if (violations.length > 0) {
          toast.error(violations[0].reason);
          setDragRooms(null); // revert to original rooms
          return;
        }
      }

      if (onRoomDrop && dragRooms) {
        onRoomDrop(dragRooms);
      }
      setDragRooms(null); // clear overlay — parent now owns the state
    }
  };

  if (!displayRooms || displayRooms.length === 0) {
    return (
      <div className="blueprint-empty">
        <p>No layout data to display.</p>
      </div>
    );
  }

  const PAD = 6;
  const WALL = 0.4;

  const allX = displayRooms.flatMap(r => [r.x, r.x + r.width]);
  const allY = displayRooms.flatMap(r => [r.y, r.y + r.height]);
  const minX = Math.min(...allX) - PAD;
  const minY = Math.min(...allY) - PAD;
  const maxX = Math.max(...allX) + PAD;
  const maxY = Math.max(...allY) + PAD;
  const vbW = maxX - minX;
  const vbH = maxY - minY;
  const viewBox = `${minX} ${minY} ${vbW} ${vbH}`;

  const scaleLen = 10;
  const sbX = minX + PAD * 0.6;
  const sbY = maxY - PAD * 0.2;

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', background: 'var(--input-bg, #FFFFFF)' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <defs>
        {/* Fine blueprint grid */}
        <pattern id="finegrid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#F1F5F9" strokeWidth="0.04" />
        </pattern>
        <pattern id="coarsegrid" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="url(#finegrid)" />
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#E2E8F0" strokeWidth="0.1" />
        </pattern>
        {/* Wall hatch pattern */}
        <pattern id="hatch" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M-0.5,0.5 l1,-1 M0,1 l1,-1 M0.5,1.5 l1,-1" stroke="#CBD5E1" strokeWidth="0.15" />
        </pattern>
        
        {/* Dropshadow for 3D effect */}
        <filter id="dropshadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0.2" dy="0.3" stdDeviation="0.4" floodColor="#0F172A" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* Grid background */}
      <rect x={minX} y={minY} width={vbW} height={vbH} fill="url(#coarsegrid)" opacity={0.7} />

      {/* Title block */}
      <text x={minX + PAD * 0.5} y={minY + PAD * 0.35}
        fontSize={1.2} fontFamily="Inter, sans-serif" fontWeight="700"
        fill="#E0E0E0" letterSpacing="0.05">
        FLOOR PLAN
      </text>
      <text x={minX + PAD * 0.5} y={minY + PAD * 0.65}
        fontSize={0.75} fontFamily="Inter, sans-serif"
        fill="#A0A0A0">
        Interactive Blueprint • {displayRooms.length} Rooms
      </text>

      {/* Outer building boundary */}
      {(() => {
        const enclosedRooms = displayRooms.filter(r => 
          !r.name.toLowerCase().includes('balcony') && 
          !r.name.toLowerCase().includes('terrace') && 
          !r.name.toLowerCase().includes('parking') &&
          !r.name.toLowerCase().includes('open area')
        );
        const boundsRooms = enclosedRooms.length > 0 ? enclosedRooms : displayRooms;
        if (boundsRooms.length === 0) return null;
        return (
          <rect
            x={Math.min(...boundsRooms.map(r => r.x)) - WALL} 
            y={Math.min(...boundsRooms.map(r => r.y)) - WALL}
            width={Math.max(...boundsRooms.map(r => r.x + r.width)) - Math.min(...boundsRooms.map(r => r.x)) + WALL * 2}
            height={Math.max(...boundsRooms.map(r => r.y + r.height)) - Math.min(...boundsRooms.map(r => r.y)) + WALL * 2}
          fill="url(#hatch)"
          stroke="#1e293b"
          strokeWidth={WALL * 1.5}
          />
        );
      })()}

      {/* Rooms */}
      {displayRooms.map((room, i) => {
        const style = getRoomStyle(room.name);
        const { fill, labelColor } = style;

        const isSelected = selectedRoom?.name === room.name;
        const cx = room.x + room.width / 2;
        const cy = room.y + room.height / 2;
        const labelSize = Math.max(0.75, Math.min(room.width, room.height) * 0.12, 1);
        const subSize = labelSize * 0.68;
        const sqft = Math.round(room.width * room.height);

        const isBalcony = room.name.toLowerCase().includes('balcony') || 
                          room.name.toLowerCase().includes('terrace');

        if (isBalcony) {
          return (
            <g key={`${room.name}-${i}`}
              className={`room-group ${isSelected ? 'selected' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (onRoomSelect) onRoomSelect(room, i);
                handlePointerDown(e, room, i);
              }}
              style={{ cursor: draggingRoomIndex === i ? 'grabbing' : 'grab', touchAction: 'none' }}>
              
              {/* Light open-air fill */}
              <rect x={room.x} y={room.y} width={room.width} height={room.height}
                    fill="rgba(147, 197, 253, 0.15)" stroke="none" />
              {/* Inner wall — solid (shared with room above) */}
              <line x1={room.x} y1={room.y} x2={room.x + room.width} y2={room.y}
                    stroke="#1e293b" strokeWidth={WALL * 0.8} />
              {/* Outer boundary — thin dashed line indicating open edge */}
              <rect x={room.x} y={room.y} width={room.width} height={room.height}
                    stroke="#64748b" strokeWidth={WALL * 0.2} strokeDasharray="4 4" fill="none" />
              
              {/* Railing pattern — diagonal hatch lines inside */}
              <line x1={room.x} y1={room.y} x2={room.x + room.width} y2={room.y + room.height}
                    stroke="rgba(147,197,253,0.3)" strokeWidth={0.15} />
              <line x1={room.x + room.width} y1={room.y} x2={room.x} y2={room.y + room.height}
                    stroke="rgba(147,197,253,0.3)" strokeWidth={0.15} />

              <text x={cx} y={cy - subSize * 0.5} textAnchor="middle" dominantBaseline="middle"
                    fill="#1d4ed8" fontSize={labelSize} fontWeight="700"
                    fontFamily="Inter, system-ui, sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                🌿 {room.name}
              </text>
              <text x={cx} y={cy + labelSize * 0.5} textAnchor="middle" dominantBaseline="middle"
                    fill="#3b82f6" fontSize={subSize} fontFamily="Inter, system-ui, sans-serif" opacity={0.8}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {Math.round(room.width)}×{Math.round(room.height)} ft · {sqft} sqft
              </text>
            </g>
          );
        }

        return (
          <g key={`${room.name}-${i}`}
            className={`room-group ${isSelected ? 'selected' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (onRoomSelect) onRoomSelect(room, i);
              handlePointerDown(e, room, i);
            }}
            style={{ cursor: draggingRoomIndex === i ? 'grabbing' : 'grab', touchAction: 'none' }}>

            {/* Room fill */}
            <rect
              x={room.x} y={room.y}
              width={room.width} height={room.height}
              fill={fill}
              stroke={isSelected ? '#2563eb' : style.stroke}
              strokeWidth={isSelected ? WALL * 0.9 : WALL * 0.65}
            />

            {/* Inner wall shadow inset */}
            <rect
              x={room.x + WALL * 0.35} y={room.y + WALL * 0.35}
              width={room.width - WALL * 0.7} height={room.height - WALL * 0.7}
              fill="none"
              stroke={isSelected ? '#93c5fd' : 'rgba(80,100,130,0.12)'}
              strokeWidth={0.08}
              style={{ pointerEvents: 'none' }}
            />

            {/* Selection highlight */}
            {isSelected && (
              <g>
                <rect
                  x={room.x - 0.3} y={room.y - 0.3}
                  width={room.width + 0.6} height={room.height + 0.6}
                  fill="rgba(37,99,235,0.08)"
                  stroke="#2563eb"
                  strokeWidth={0.2}
                  strokeDasharray="1 0.5"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Grab Handles for Edge Dragging */}
                <rect
                  x={room.x + 0.8} y={room.y - 0.8}
                  width={Math.max(0, room.width - 1.6)} height={1.6}
                  fill="transparent"
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'top'); }}
                />
                <rect
                  x={room.x + 0.8} y={room.y + room.height - 0.8}
                  width={Math.max(0, room.width - 1.6)} height={1.6}
                  fill="transparent"
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'bottom'); }}
                />
                <rect
                  x={room.x - 0.8} y={room.y + 0.8}
                  width={1.6} height={Math.max(0, room.height - 1.6)}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'left'); }}
                />
                <rect
                  x={room.x + room.width - 0.8} y={room.y + 0.8}
                  width={1.6} height={Math.max(0, room.height - 1.6)}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'right'); }}
                />
                {/* Grab Handles for Vertex Dragging */}
                <circle
                  cx={room.x} cy={room.y} r={0.6}
                  fill="white" stroke="#2563eb" strokeWidth={0.2}
                  style={{ cursor: 'nwse-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'topLeft'); }}
                />
                <circle
                  cx={room.x + room.width} cy={room.y} r={0.6}
                  fill="white" stroke="#2563eb" strokeWidth={0.2}
                  style={{ cursor: 'nesw-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'topRight'); }}
                />
                <circle
                  cx={room.x} cy={room.y + room.height} r={0.6}
                  fill="white" stroke="#2563eb" strokeWidth={0.2}
                  style={{ cursor: 'nesw-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'bottomLeft'); }}
                />
                <circle
                  cx={room.x + room.width} cy={room.y + room.height} r={0.6}
                  fill="white" stroke="#2563eb" strokeWidth={0.2}
                  style={{ cursor: 'nwse-resize' }}
                  onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, room, i, 'bottomRight'); }}
                />
              </g>
            )}

            <FurnitureLayer room={room} />

            <text
              x={cx} y={cy - subSize * 0.5}
              textAnchor="middle" dominantBaseline="middle"
              fill={labelColor} fontSize={labelSize}
              fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {room.name}
            </text>
            <text
              x={cx} y={cy + labelSize * 0.5}
              textAnchor="middle" dominantBaseline="middle"
              fill={labelColor} fontSize={subSize} opacity={0.65}
              fontFamily="Inter, system-ui, sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {Math.round(room.width)}×{Math.round(room.height)} ft · {sqft} sqft
            </text>

            {room.width > 5 && (
              <g>
                <line x1={room.x} y1={room.y - 1.2}
                  x2={room.x + room.width} y2={room.y - 1.2}
                  stroke="#94a3b8" strokeWidth={0.1} />
                <line x1={room.x} y1={room.y - 1.6}
                  x2={room.x} y2={room.y - 0.8}
                  stroke="#94a3b8" strokeWidth={0.1} />
                <line x1={room.x + room.width} y1={room.y - 1.6}
                  x2={room.x + room.width} y2={room.y - 0.8}
                  stroke="#94a3b8" strokeWidth={0.1} />
                <text x={room.x + room.width / 2} y={room.y - 1.6}
                  textAnchor="middle" fill="#64748b" fontSize={subSize * 0.85}
                  fontFamily="Inter, sans-serif"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {room.width} ft
                </text>
              </g>
            )}

            {room.height > 5 && (
              <g>
                <line x1={room.x - 1.2} y1={room.y}
                  x2={room.x - 1.2} y2={room.y + room.height}
                  stroke="#94a3b8" strokeWidth={0.1} />
                <line x1={room.x - 1.6} y1={room.y}
                  x2={room.x - 0.8} y2={room.y}
                  stroke="#94a3b8" strokeWidth={0.1} />
                <line x1={room.x - 1.6} y1={room.y + room.height}
                  x2={room.x - 0.8} y2={room.y + room.height}
                  stroke="#94a3b8" strokeWidth={0.1} />
                <text x={room.x - 1.6} y={room.y + room.height / 2}
                  textAnchor="middle" fill="#64748b" fontSize={subSize * 0.85}
                  fontFamily="Inter, sans-serif"
                  transform={`rotate(-90 ${room.x - 1.6} ${room.y + room.height / 2})`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {room.height} ft
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Pass 2: Draw doors and windows ON TOP of all walls so white gaps remain visible */}
      {displayRooms.map((room, i) => (
        <g key={`overlay-${room.name}-${i}`} style={{ pointerEvents: 'none' }}>
          {/* Doors */}
          <DoorArcs room={room} doorAttributes={doorAttributes} />

          {/* Window marks */}
          <WindowMarks room={room} />
        </g>
      ))}

      {/* Scale bar */}
      <g>
        <rect x={sbX - 0.3} y={sbY - 1.8}
          width={scaleLen + 0.6} height={2.2}
          fill="rgba(255,255,255,0.85)" rx={0.3} />
        <line x1={sbX} y1={sbY - 0.6} x2={sbX + scaleLen} y2={sbY - 0.6}
          stroke="#475569" strokeWidth={0.25} />
        {[0, scaleLen / 2, scaleLen].map(x => (
          <line key={x}
            x1={sbX + x} y1={sbY - 1} x2={sbX + x} y2={sbY - 0.2}
            stroke="#475569" strokeWidth={0.2} />
        ))}
        <text x={sbX + scaleLen / 2} y={sbY - 1.3}
          textAnchor="middle" fill="#1e293b"
          fontSize={0.8} fontFamily="Inter, sans-serif" fontWeight="600">
          Scale: 10 ft
        </text>
      </g>

      {/* North arrow */}
      {(() => {
        const ed = entryDir.toLowerCase();
        let angle = 0;
        if (ed.startsWith('e')) angle = -90;
        else if (ed.startsWith('s')) angle = 180;
        else if (ed.startsWith('w')) angle = 90;
        return (
          <g transform={`translate(${maxX - PAD * 0.5}, ${minY + PAD * 0.5}) rotate(${angle})`}>
        <circle r={2.2} fill="rgba(255,255,255,0.92)" stroke="#cbd5e1" strokeWidth={0.2} />
        <polygon points="0,-1.5 0.6,0.8 0,0.3 -0.6,0.8"
          fill="#1e293b" />
        <polygon points="0,1.5 0.6,-0.8 0,-0.3 -0.6,-0.8"
          fill="#94a3b8" />
        <text textAnchor="middle" y={-1.85} transform={`rotate(${-angle})`}
          fill="#1e293b" fontSize={0.9}
          fontFamily="Inter, sans-serif" fontWeight="800">N</text>
        </g>
        );
      })()}

      {/* Legend */}
      {displayRooms.length > 0 && (() => {
        const uniqueTypes = [...new Set(displayRooms.map(r => r.name))].slice(0, 5);
        return (
          <g transform={`translate(${maxX - PAD * 0.8}, ${minY + PAD * 3.5})`}>
            <rect x={-0.3} y={-0.5}
              width={PAD * 0.9} height={uniqueTypes.length * 1.4 + 1}
              fill="rgba(255,255,255,0.88)" stroke="#e2e8f0" strokeWidth={0.15} rx={0.3} />
            <text x={PAD * 0.4 / 2} y={0.2}
              textAnchor="middle" fill="#1e293b"
              fontSize={0.7} fontFamily="Inter, sans-serif" fontWeight="700">
              LEGEND
            </text>
            {uniqueTypes.map((name, idx) => {
              const { fill, labelColor, stroke } = getRoomStyle(name);
              return (
                <g key={name} transform={`translate(0, ${idx * 1.4 + 1.0})`}>
                  <rect x={0} y={-0.45} width={0.8} height={0.7}
                    fill={fill} stroke={stroke} strokeWidth={0.1} />
                  <text x={1.1} y={0.1}
                    fill={labelColor} fontSize={0.62}
                    fontFamily="Inter, sans-serif">
                    {name.length > 12 ? name.slice(0, 12) + '…' : name}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })()}
      {/* Circulation path overlay — toggled by the parent via showCirculation prop */}
      <CirculationOverlay circulation={circulation ?? null} visible={showCirculation ?? false} />
      <SunlightOverlay rooms={rooms} sunlightResult={sunlightResult ?? undefined} visible={showSunlight ?? false} floorIndex={floorIndex} />
    </svg>
  );
});

export default InteractiveBlueprint;
