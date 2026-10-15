/* eslint-disable react-hooks/immutability */
import React from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Box, Cylinder, Sphere, Edges, Text, Sky, useTexture } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import type { Room } from '../../../shared/api-client/api';
import * as THREE from 'three';

interface FloorPlan3DProps {
  rooms: Room[];
  entryDir?: string;
}

const ROOM_HEIGHT = 10;  // ft ceiling height — must match cost_rates.CEILING_HEIGHT_FT
const WALL_T      = 0.3;

// ── PBR room material palette — roughness/metalness tuned per surface type ─────
// Using the threejs-materials skill: MeshPhysicalMaterial for advanced realism
function getRoomMaterial(name: string): { floorColor: string; wallColor: string; floorRoughness: number; wallRoughness: number } {
  const n = name.toLowerCase();
  if (n.includes('master'))  return { floorColor: '#c8a878', wallColor: '#e8e0d8', floorRoughness: 0.3, wallRoughness: 0.85 };
  if (n.includes('bedroom')) return { floorColor: '#c4a870', wallColor: '#e8ece0', floorRoughness: 0.3, wallRoughness: 0.85 };
  if (n.includes('bath'))    return { floorColor: '#c0c8cc', wallColor: '#e4eeef', floorRoughness: 0.15, wallRoughness: 0.2 };
  if (n.includes('kitchen')) return { floorColor: '#b0b8b0', wallColor: '#f2f0e8', floorRoughness: 0.15, wallRoughness: 0.25 };
  if (n.includes('living'))  return { floorColor: '#c0a872', wallColor: '#ece8e0', floorRoughness: 0.3, wallRoughness: 0.85 };
  if (n.includes('dining'))  return { floorColor: '#b8a060', wallColor: '#ede8e2', floorRoughness: 0.35, wallRoughness: 0.85 };
  if (n.includes('balcony') || n.includes('terrace')) return { floorColor: '#909888', wallColor: '#d8dcd0', floorRoughness: 0.7, wallRoughness: 0.8 };
  if (n.includes('stair'))   return { floorColor: '#a09880', wallColor: '#dcd8cc', floorRoughness: 0.5, wallRoughness: 0.85 };
  if (n.includes('foyer'))   return { floorColor: '#b0a080', wallColor: '#eee8dc', floorRoughness: 0.2, wallRoughness: 0.8 };
  if (n.includes('parking')) return { floorColor: '#606060', wallColor: '#888888', floorRoughness: 0.8, wallRoughness: 0.9 };
  if (n.includes('corridor'))return { floorColor: '#909090', wallColor: '#d8d8d8', floorRoughness: 0.4, wallRoughness: 0.85 };
  return { floorColor: '#b0a890', wallColor: '#dcd8d0', floorRoughness: 0.35, wallRoughness: 0.85 };
}

// External 3D assets removed for stability (Trees/Cars)

// ── Scene renderer that uses gl for tonemapping ───────────────────────────────
function SceneSetup() {
  const { gl } = useThree();
  React.useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl]);
  return null;
}

// ── Staircase — architecturally correct U-shape flight ────────────────────────
// A standard stair: steps climb from y=0 (bottom/entry) to y=room.height (top).
// Steps are placed in world space.
function Stairs3D({ room }: { room: Room }) {
  const numStepsHalf = 8;
  const stepH    = ROOM_HEIGHT / (numStepsHalf * 2);
  const stepD    = (room.height * 0.75) / numStepsHalf; // 75% depth for steps, 25% for landing
  const stepW    = (room.width - 0.6) / 2; // two flights side by side with gap
  
  const startZ   = room.y;
  const landingZ = startZ + room.height * 0.75;
  const landingD = room.height * 0.25;
  const leftX    = room.x + 0.25 + stepW / 2;
  const rightX   = room.x + room.width - 0.25 - stepW / 2;

  // Flight 1 (Left side, going UP from front to back)
  const flight1 = Array.from({ length: numStepsHalf }).map((_, i) => {
    const y = i * stepH;
    const z = startZ + i * stepD;
    return (
      <group key={`f1_${i}`}>
        <Box castShadow receiveShadow args={[stepW, stepH * 1.05, stepD]} position={[leftX, y + stepH / 2, z + stepD / 2]}>
          <meshStandardMaterial color={i % 2 === 0 ? '#d6cbaf' : '#c2b898'} />
          <Edges color="#8a7a60" />
        </Box>
        <Box castShadow receiveShadow args={[stepW + 0.1, 0.08, 0.15]} position={[leftX, y + stepH, z]}>
          <meshStandardMaterial color="#9a8a6a" />
        </Box>
      </group>
    );
  });

  // Landing
  const landingY = numStepsHalf * stepH;
  const landing = (
    <group>
      <Box castShadow receiveShadow args={[room.width - 0.4, stepH * 1.05, landingD]} position={[room.x + room.width / 2, landingY - stepH / 2, landingZ + landingD / 2]}>
        <meshStandardMaterial color="#c2b898" />
        <Edges color="#8a7a60" />
      </Box>
    </group>
  );

  // Flight 2 (Right side, going UP from back to front)
  const flight2 = Array.from({ length: numStepsHalf }).map((_, i) => {
    const y = landingY + i * stepH;
    const z = landingZ - (i + 1) * stepD;
    return (
      <group key={`f2_${i}`}>
        <Box castShadow receiveShadow args={[stepW, stepH * 1.05, stepD]} position={[rightX, y + stepH / 2, z + stepD / 2]}>
          <meshStandardMaterial color={i % 2 === 0 ? '#d6cbaf' : '#c2b898'} />
          <Edges color="#8a7a60" />
        </Box>
        <Box castShadow receiveShadow args={[stepW + 0.1, 0.08, 0.15]} position={[rightX, y + stepH, z + stepD]}>
          <meshStandardMaterial color="#9a8a6a" />
        </Box>
      </group>
    );
  });

  // Railings
  // Flight 1 inner railing (Right side of left flight)
  const r1X = room.x + 0.25 + stepW;
  const r1 = [0.1, 0.5, 0.9].map((t, i) => (
    <Cylinder castShadow receiveShadow key={`r1_${i}`} args={[0.04, 0.04, 3, 8]} position={[r1X, t * landingY + 1.5, startZ + t * (landingZ - startZ)]}>
      <meshStandardMaterial color="#7a6030" metalness={0.25} roughness={0.6} />
    </Cylinder>
  ));
  const handrail1 = (
    <Box castShadow receiveShadow args={[0.06, 0.06, Math.hypot(landingZ - startZ, landingY)]} position={[r1X, landingY / 2 + 3, startZ + (landingZ - startZ)/2]} rotation={[-Math.atan2(landingY, landingZ - startZ), 0, 0]}>
      <meshStandardMaterial color="#6a5020" metalness={0.25} roughness={0.6} />
    </Box>
  );
  
  // Flight 2 inner railing (Left side of right flight)
  const r2X = room.x + room.width - 0.25 - stepW;
  const r2 = [0.1, 0.5, 0.9].map((t, i) => {
    const z = landingZ - t * (landingZ - startZ);
    const y = landingY + t * (ROOM_HEIGHT - landingY);
    return (
      <Cylinder castShadow receiveShadow key={`r2_${i}`} args={[0.04, 0.04, 3, 8]} position={[r2X, y + 1.5, z]}>
        <meshStandardMaterial color="#7a6030" metalness={0.25} roughness={0.6} />
      </Cylinder>
    );
  });
  const handrail2 = (
    <Box castShadow receiveShadow args={[0.06, 0.06, Math.hypot(landingZ - startZ, ROOM_HEIGHT - landingY)]} position={[r2X, (landingY + ROOM_HEIGHT)/2 + 3, startZ + (landingZ - startZ)/2]} rotation={[Math.atan2(ROOM_HEIGHT - landingY, landingZ - startZ), 0, 0]}>
      <meshStandardMaterial color="#6a5020" metalness={0.25} roughness={0.6} />
    </Box>
  );

  return (
    <group>
      {flight1}
      {landing}
      {flight2}
      {r1}
      {handrail1}
      {r2}
      {handrail2}
    </group>
  );
}

// ── 3D Furniture — architecturally placed ────────────────────────────────────
function FurnitureItem3D({ item, roomX, roomY }: {
  item: { name: string; x: number; y: number; width: number; height: number };
  roomX: number;
  roomY: number;
}) {
  const n  = item.name.toLowerCase();
  // World-space center of this furniture footprint
  const wx = roomX + item.x + item.width  / 2;
  const wz = roomY + item.y + item.height / 2;
  const fw = item.width;
  const fd = item.height;

  // ── Bed ──────────────────────────────────────────────────────────────────────
  if ((n.includes('bed') || n.includes('king') || n.includes('double') || n.includes('single'))
      && !n.includes('side') && !n.includes('step')) {
    const frameColor  = '#6e4e28';
    const mattressColor = '#f0ece4';
    const pillowColor = '#ffffff';
    const headboardH  = ROOM_HEIGHT * 0.35;
    return (
      <group position={[wx, 0, wz]}>
        {/* Frame */}
        <Box castShadow receiveShadow args={[fw, 0.4, fd]} position={[0, 0.2, 0]}>
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </Box>
        {/* Mattress */}
        <Box castShadow receiveShadow args={[fw - 0.2, 1.0, fd - 0.2]} position={[0, 0.9, 0]}>
          <meshStandardMaterial color={mattressColor} roughness={0.8} />
        </Box>
        {/* Pillows */}
        <Box castShadow receiveShadow args={[(fw - 0.4) / 2 - 0.1, 0.25, fd * 0.2]} position={[-fw * 0.2, 1.52, -fd * 0.36]}>
          <meshStandardMaterial color={pillowColor} roughness={0.9} />
        </Box>
        <Box castShadow receiveShadow args={[(fw - 0.4) / 2 - 0.1, 0.25, fd * 0.2]} position={[fw * 0.2, 1.52, -fd * 0.36]}>
          <meshStandardMaterial color={pillowColor} roughness={0.9} />
        </Box>
        {/* Headboard */}
        <Box castShadow receiveShadow args={[fw, headboardH, 0.2]} position={[0, headboardH / 2, -fd / 2 + 0.12]}>
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </Box>
        {/* Footboard */}
        <Box castShadow receiveShadow args={[fw, 1.2, 0.15]} position={[0, 0.6, fd / 2 - 0.1]}>
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </Box>
      </group>
    );
  }

  // ── Bedside Table ──────────────────────────────────────────────────────────
  if (n.includes('side') && n.includes('table')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 2.2, fd]} position={[0, 1.1, 0]}>
          <meshStandardMaterial color="#b8922a" roughness={0.4} />
        </Box>
        <Box castShadow receiveShadow args={[fw + 0.04, 0.06, fd + 0.04]} position={[0, 2.23, 0]}>
          <meshStandardMaterial color="#c8a030" />
        </Box>
        {/* Lamp */}
        <Cylinder castShadow receiveShadow args={[0.04, 0.04, 0.8, 8]} position={[0, 2.23 + 0.4, 0]}>
          <meshStandardMaterial color="#888" metalness={0.6} />
        </Cylinder>
        <Cylinder castShadow receiveShadow args={[0.25, 0.12, 0.35, 12]} position={[0, 2.23 + 0.9, 0]}>
          <meshStandardMaterial color="#fffde0" emissive="#fffde0" emissiveIntensity={0.3} />
        </Cylinder>
      </group>
    );
  }

  // ── Sofa ──────────────────────────────────────────────────────────────────
  if (n.includes('sofa') || n.includes('couch')) {
    const sofaC = '#5c6e94';
    const backC = '#4a5c82';
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 1.1, fd * 0.55]} position={[0, 0.55, fd * 0.12]}>
          <meshStandardMaterial color={sofaC} roughness={0.7} />
        </Box>
        {/* Back */}
        <Box castShadow receiveShadow args={[fw, 2.1, fd * 0.18]} position={[0, 1.05, -fd * 0.4]}>
          <meshStandardMaterial color={backC} roughness={0.7} />
        </Box>
        {/* Armrests */}
        <Box castShadow receiveShadow args={[fw * 0.12, 1.8, fd * 0.72]} position={[-fw / 2 + fw * 0.06, 0.9, -fd * 0.12]}>
          <meshStandardMaterial color={backC} roughness={0.7} />
        </Box>
        <Box castShadow receiveShadow args={[fw * 0.12, 1.8, fd * 0.72]} position={[fw / 2 - fw * 0.06, 0.9, -fd * 0.12]}>
          <meshStandardMaterial color={backC} roughness={0.7} />
        </Box>
        {/* Cushion seams */}
        {[-fw * 0.22, fw * 0.22].map((ox, i) => (
          <Box castShadow receiveShadow key={i} args={[0.05, 1.15, fd * 0.5]} position={[ox, 0.55, fd * 0.14]}>
            <meshStandardMaterial color={backC} />
          </Box>
        ))}
      </group>
    );
  }

  // ── Armchair ───────────────────────────────────────────────────────────────
  if (n.includes('armchair') || (n.includes('chair') && !n.includes('dining') && !n.includes('study') && !n.includes('patio') && !n.includes('outdoor'))) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 1.0, fd * 0.6]} position={[0, 0.5, fd * 0.1]}>
          <meshStandardMaterial color="#6e7eb0" roughness={0.7} />
        </Box>
        <Box castShadow receiveShadow args={[fw, 1.9, fd * 0.2]} position={[0, 0.95, -fd * 0.38]}>
          <meshStandardMaterial color="#5a6a9e" roughness={0.7} />
        </Box>
        <Box castShadow receiveShadow args={[fw * 0.2, 1.55, fd * 0.8]} position={[-fw / 2 + fw * 0.1, 0.78, 0]}>
          <meshStandardMaterial color="#5a6a9e" />
        </Box>
        <Box castShadow receiveShadow args={[fw * 0.2, 1.55, fd * 0.8]} position={[fw / 2 - fw * 0.1, 0.78, 0]}>
          <meshStandardMaterial color="#5a6a9e" />
        </Box>
      </group>
    );
  }

  // ── Dining / Coffee / Patio Table ─────────────────────────────────────────
  if (n.includes('table') && !n.includes('side') && !n.includes('bedside')) {
    const h = n.includes('coffee') ? 1.4 : 2.9;
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 0.12, fd]} position={[0, h, 0]}>
          <meshStandardMaterial color="#a87820" roughness={0.4} />
        </Box>
        {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz],i) => (
          <Box castShadow receiveShadow key={i} args={[0.09, h, 0.09]} position={[sx*(fw/2-0.12), h/2, sz*(fd/2-0.12)]}>
            <meshStandardMaterial color="#7a5c10" roughness={0.5} />
          </Box>
        ))}
      </group>
    );
  }

  // ── Dining / Study / Patio Chair ──────────────────────────────────────────
  if (n.includes('dining chair') || n.includes('study chair') || n.includes('patio chair') || n.includes('outdoor chair')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 0.07, fd]} position={[0, 1.8, 0]}>
          <meshStandardMaterial color="#906020" roughness={0.5} />
        </Box>
        <Box castShadow receiveShadow args={[fw, 1.5, 0.1]} position={[0, 0.9, -fd/2+0.05]}>
          <meshStandardMaterial color="#7a5010" roughness={0.5} />
        </Box>
        {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz],i) => (
          <Box castShadow receiveShadow key={i} args={[0.07,1.8,0.07]} position={[sx*(fw/2-0.1),0.9,sz*(fd/2-0.1)]}>
            <meshStandardMaterial color="#7a5010" />
          </Box>
        ))}
      </group>
    );
  }

  // ── Wardrobe / Cabinet ────────────────────────────────────────────────────
  if (n.includes('wardrobe') || n.includes('cabinet')) {
    const wh = 7.5;
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, wh, fd]} position={[0, wh/2, 0]}>
          <meshStandardMaterial color="#6a4e28" roughness={0.4} />
          <Edges color="#4a2e10" />
        </Box>
        {/* Panel seam */}
        <Box castShadow receiveShadow args={[0.05, wh-0.2, fd+0.02]} position={[0, wh/2, 0]}>
          <meshStandardMaterial color="#4a2e10" />
        </Box>
        {/* Handles */}
        {[-fw*0.25, fw*0.25].map((ox,i) => (
          <Box castShadow receiveShadow key={i} args={[0.06,0.6,0.06]} position={[ox, wh/2, fd/2+0.04]}>
            <meshStandardMaterial color="#c8a040" metalness={0.8} roughness={0.2} />
          </Box>
        ))}
      </group>
    );
  }

  // ── Sideboard ─────────────────────────────────────────────────────────────
  if (n.includes('sideboard')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 3, fd]} position={[0, 1.5, 0]}>
          <meshStandardMaterial color="#7a5c2a" roughness={0.4} />
        </Box>
        <Box castShadow receiveShadow args={[fw+0.04, 0.06, fd+0.04]} position={[0, 3.03, 0]}>
          <meshStandardMaterial color="#8a6c3a" />
        </Box>
      </group>
    );
  }

  // ── Desk / Dressing / Console ──────────────────────────────────────────────
  if (n.includes('desk') || n.includes('dressing') || n.includes('console')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 0.1, fd]} position={[0, 2.9, 0]}>
          <meshStandardMaterial color="#b09030" roughness={0.4} />
        </Box>
        {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz],i) => (
          <Box castShadow receiveShadow key={i} args={[0.08,2.9,0.08]} position={[sx*(fw/2-0.1),1.45,sz*(fd/2-0.1)]}>
            <meshStandardMaterial color="#7a6020" roughness={0.5} />
          </Box>
        ))}
      </group>
    );
  }

  // ── Counter / Kitchen Island ───────────────────────────────────────────────
  if (n.includes('counter') || n.includes('kitchen island')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 3.2, fd]} position={[0, 1.6, 0]}>
          <meshStandardMaterial color="#ddd8c0" roughness={0.3} />
        </Box>
        <Box castShadow receiveShadow args={[fw+0.08, 0.1, fd+0.08]} position={[0, 3.25, 0]}>
          <meshStandardMaterial color="#b8b4a0" roughness={0.2} />
        </Box>
      </group>
    );
  }

  // ── Refrigerator ──────────────────────────────────────────────────────────
  if (n.includes('refrigerator') || n.includes('fridge')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 7.0, fd]} position={[0, 3.5, 0]}>
          <meshStandardMaterial color="#d8d8d8" roughness={0.2} />
          <Edges color="#b8b8b8" />
        </Box>
        <Box castShadow receiveShadow args={[0.05, 3.0, 0.05]} position={[fw/2-0.12, 3.5, fd/2+0.03]}>
          <meshStandardMaterial color="#b0902a" metalness={0.7} />
        </Box>
      </group>
    );
  }

  // ── Oven / Stove ──────────────────────────────────────────────────────────
  if (n.includes('oven')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 3.6, fd]} position={[0, 1.8, 0]}>
          <meshStandardMaterial color="#222222" roughness={0.3} />
          <Edges color="#444" />
        </Box>
        <Box castShadow receiveShadow args={[fw-0.2, 1.8, 0.08]} position={[0, 1.5, fd/2+0.05]}>
          <meshStandardMaterial color="#111" />
        </Box>
        {/* Burners on top */}
        {([-fw*0.22, fw*0.22] as number[]).map((ox,i) => (
          <Cylinder castShadow receiveShadow key={i} args={[0.4, 0.4, 0.08, 16]} position={[ox, 3.64, 0]} rotation={[Math.PI/2, 0, 0]}>
            <meshStandardMaterial color="#333" metalness={0.6} />
          </Cylinder>
        ))}
      </group>
    );
  }

  // ── Sink / Vanity Sink ─────────────────────────────────────────────────────
  if (n.includes('sink') || n.includes('vanity')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 3.1, fd]} position={[0, 1.55, 0]}>
          <meshStandardMaterial color="#efefef" roughness={0.3} />
        </Box>
        <Box castShadow receiveShadow args={[fw-0.1, 0.08, fd-0.1]} position={[0, 3.14, 0]}>
          <meshStandardMaterial color="#d8dce0" />
        </Box>
        {/* Basin */}
        <Box castShadow receiveShadow args={[fw-0.35, 0.5, fd-0.3]} position={[0, 3.44, 0]}>
          <meshStandardMaterial color="#a8d0de" opacity={0.8} transparent />
        </Box>
        {/* Tap */}
        <Cylinder castShadow receiveShadow args={[0.05, 0.05, 1.0, 8]} position={[0, 3.64+0.5, 0]}>
          <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
        </Cylinder>
      </group>
    );
  }

  // ── WC / Toilet ───────────────────────────────────────────────────────────
  if (n.includes('wc') || n.includes('toilet')) {
    return (
      <group position={[wx, 0, wz]}>
        {/* Cistern */}
        <Box castShadow receiveShadow args={[fw, 2.6, fd*0.28]} position={[0, 1.3, -fd*0.35]}>
          <meshStandardMaterial color="#f5f5f5" roughness={0.3} />
        </Box>
        {/* Pan */}
        <Box castShadow receiveShadow args={[fw, 1.6, fd*0.65]} position={[0, 0.8, fd*0.12]}>
          <meshStandardMaterial color="#f0f0f0" roughness={0.3} />
          <Edges color="#d0d0d0" />
        </Box>
        {/* Seat */}
        <Box castShadow receiveShadow args={[fw-0.1, 0.1, fd*0.6]} position={[0, 1.65, fd*0.12]}>
          <meshStandardMaterial color="#e8e8e8" />
        </Box>
      </group>
    );
  }

  // ── Bathtub ────────────────────────────────────────────────────────────────
  if (n.includes('bathtub') || n.includes('bath tub')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 2.0, fd]} position={[0, 1.0, 0]}>
          <meshStandardMaterial color="#f4f4f4" roughness={0.25} />
          <Edges color="#d0d0d0" />
        </Box>
        {/* Water */}
        <Box castShadow receiveShadow args={[fw-0.2, 1.3, fd-0.2]} position={[0, 1.05, 0]}>
          <meshStandardMaterial color="#a0c8dc" opacity={0.55} transparent />
        </Box>
        <Cylinder castShadow receiveShadow args={[0.07, 0.07, 0.9, 8]} position={[fw/2-0.25, 2.5, -fd/4]}>
          <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
        </Cylinder>
      </group>
    );
  }

  // ── Shower ─────────────────────────────────────────────────────────────────
  if (n.includes('shower')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 0.18, fd]} position={[0, 0.09, 0]}>
          <meshStandardMaterial color="#c4dcc4" roughness={0.3} />
        </Box>
        {/* Glass walls */}
        <Box castShadow receiveShadow args={[fw, ROOM_HEIGHT*0.78, 0.05]} position={[0, ROOM_HEIGHT*0.39, fd/2]}>
          <meshStandardMaterial color="#90b8c8" opacity={0.22} transparent />
        </Box>
        <Box castShadow receiveShadow args={[0.05, ROOM_HEIGHT*0.78, fd]} position={[-fw/2, ROOM_HEIGHT*0.39, 0]}>
          <meshStandardMaterial color="#90b8c8" opacity={0.22} transparent />
        </Box>
        {/* Shower head */}
        <Cylinder castShadow receiveShadow args={[0.18, 0.18, 0.07, 16]} position={[0, ROOM_HEIGHT*0.76, -fd*0.3]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#c8c8c8" metalness={0.85} roughness={0.15} />
        </Cylinder>
        <Cylinder castShadow receiveShadow args={[0.04, 0.04, 0.7, 8]} position={[0, ROOM_HEIGHT*0.4+0.5, -fd/2+0.2]}>
          <meshStandardMaterial color="#b0b0b0" metalness={0.8} roughness={0.2} />
        </Cylinder>
      </group>
    );
  }

  // ── TV Unit ────────────────────────────────────────────────────────────────
  if (n.includes('tv unit') || n.includes('tv')) {
    return (
      <group position={[wx, 0, wz]}>
        {/* Cabinet */}
        <Box castShadow receiveShadow args={[fw, 1.6, fd]} position={[0, 0.8, 0]}>
          <meshStandardMaterial color="#2a2a2a" roughness={0.4} />
        </Box>
        {/* TV screen */}
        <Box castShadow receiveShadow args={[fw-0.15, 3.2, 0.12]} position={[0, 1.6+1.6, -fd/2-0.07]}>
          <meshStandardMaterial color="#0a0a14" />
        </Box>
        {/* Screen glow */}
        <Box castShadow receiveShadow args={[fw-0.3, 2.9, 0.05]} position={[0, 1.6+1.6, -fd/2-0.1]}>
          <meshStandardMaterial color="#0a0a28" emissive="#080816" emissiveIntensity={0.5} />
        </Box>
      </group>
    );
  }

  // ── Bookshelf ──────────────────────────────────────────────────────────────
  if (n.includes('bookshelf') || n.includes('shelf')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 6.5, fd]} position={[0, 3.25, 0]}>
          <meshStandardMaterial color="#7a5a2a" roughness={0.4} />
          <Edges color="#5a3a10" />
        </Box>
        {[1.3, 2.7, 4.1, 5.4].map((sh, i) => (
          <Box castShadow receiveShadow key={i} args={[fw-0.1, 0.07, fd-0.05]} position={[0, sh, 0]}>
            <meshStandardMaterial color="#5a3a10" />
          </Box>
        ))}
      </group>
    );
  }

  // ── Washing Machine / Dryer ───────────────────────────────────────────────
  if (n.includes('washing machine') || n.includes('dryer')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, fd*2.2, fd]} position={[0, fd*1.1, 0]}>
          <meshStandardMaterial color="#e8e8e8" roughness={0.3} />
          <Edges color="#c8c8c8" />
        </Box>
        <Cylinder castShadow receiveShadow args={[fd*0.32, fd*0.32, 0.12, 20]} position={[0, fd*2.05, fd/2+0.07]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#9ab0c0" roughness={0.3} />
        </Cylinder>
      </group>
    );
  }

  // ── Plant Pot ─────────────────────────────────────────────────────────────
  if (n.includes('plant') || n.includes('pot')) {
    return (
      <group position={[wx, 0, wz]}>
        <Cylinder castShadow receiveShadow args={[fw/2*0.65, fw/2, fd, 12]} position={[0, fd/2, 0]}>
          <meshStandardMaterial color="#8b4513" roughness={0.8} />
        </Cylinder>
        <Cylinder castShadow receiveShadow args={[fw/2*1.1, fw/2*0.8, fw*0.7, 10]} position={[0, fd+fw*0.35, 0]}>
          <meshStandardMaterial color="#228b22" roughness={0.9} />
        </Cylinder>
      </group>
    );
  }

  // ── Car (Removed external GLTF) ─────────────
  if (n.includes('car')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 1.4, fd]} position={[0, 0.7, 0]}>
          <meshStandardMaterial color="#b23" roughness={0.4} metalness={0.6} />
        </Box>
      </group>
    );
  }

  // ── Bench / Lounger ───────────────────────────────────────────────────────
  if (n.includes('bench') || n.includes('lounger')) {
    return (
      <group position={[wx, 0, wz]}>
        <Box castShadow receiveShadow args={[fw, 0.25, fd]} position={[0, 1.3, 0]}>
          <meshStandardMaterial color="#c0a070" roughness={0.6} />
        </Box>
        {([[-fw/2+0.15,-fd/2+0.15],[fw/2-0.15,-fd/2+0.15],[-fw/2+0.15,fd/2-0.15],[fw/2-0.15,fd/2-0.15]] as [number,number][]).map(([lx,lz],i) => (
          <Box castShadow receiveShadow key={i} args={[0.1, 1.3, 0.1]} position={[lx, 0.65, lz]}>
            <meshStandardMaterial color="#9a7840" roughness={0.6} />
          </Box>
        ))}
      </group>
    );
  }

  // ── Generic fallback ──────────────────────────────────────────────────────
  return (
    <Box castShadow receiveShadow args={[Math.max(fw, 0.5), 1.0, Math.max(fd, 0.5)]} position={[wx, 0.5, wz]}>
      <meshStandardMaterial color="#b0b8c4" opacity={0.6} transparent />
    </Box>
  );
}



// ── Wall segment renderer with door/window openings ──────────────────────────
// Renders a single wall as a series of segments with gaps for doors and windows.
// wallLen: total length of wall, wallBase: world-space X or Z start of wall
// isHorizontal: true for north/south walls, false for east/west
// openings: sorted list of { pos, width, type } where pos is offset from wallBase
function WallWithOpenings({
  wallLen, wallBase, wallFixed, wallT, isHoriz,
  openings, wallColor,
}: {
  wallLen: number; wallBase: number; wallFixed: number; wallT: number;
  isHoriz: boolean; openings: { pos: number; width: number; type: 'door' | 'window' | 'garage_door'; isStairDoor?: boolean }[];
  wallColor: string;
}) {
  const [wallDiff, wallBump] = useTexture([
    '/assets/textures/brick_diffuse.jpg',
    '/assets/textures/brick_bump.jpg'
  ]);
  
  React.useEffect(() => {
    wallDiff.wrapS = wallDiff.wrapT = THREE.RepeatWrapping;
    wallDiff.repeat.set(wallLen / 5, ROOM_HEIGHT / 5);
    wallDiff.needsUpdate = true;
    wallBump.wrapS = wallBump.wrapT = THREE.RepeatWrapping;
    wallBump.repeat.set(wallLen / 5, ROOM_HEIGHT / 5);
    wallBump.needsUpdate = true;
  }, [wallDiff, wallBump, wallLen]);

  const DOOR_H    = ROOM_HEIGHT * 0.82;   // door height (ft)
  const WIN_SILL  = ROOM_HEIGHT * 0.32;   // window sill height
  const WIN_H     = ROOM_HEIGHT * 0.38;   // window height
  const LINTEL_H  = ROOM_HEIGHT - WIN_SILL - WIN_H;  // wall above window

  const sorted = [...openings].sort((a, b) => a.pos - b.pos);

  // Build list of segments: { start, end }
  const segments: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const op of sorted) {
    if (op.pos > cursor) segments.push({ start: cursor, end: op.pos });
    cursor = op.pos + op.width;
  }
  if (cursor < wallLen) segments.push({ start: cursor, end: wallLen });

  return (
    <group>
      {/* Solid wall segments between openings */}
      {segments.map((seg, i) => {
        const segLen  = seg.end - seg.start;
        const segMid  = wallBase + seg.start + segLen / 2;
        const pos3: [number, number, number] = isHoriz
          ? [segMid, ROOM_HEIGHT / 2, wallFixed]
          : [wallFixed, ROOM_HEIGHT / 2, segMid];
        const args3: [number, number, number] = isHoriz
          ? [segLen, ROOM_HEIGHT, wallT]
          : [wallT, ROOM_HEIGHT, segLen];
        return (
          <Box key={i} castShadow receiveShadow args={args3} position={pos3}>
            <meshStandardMaterial map={wallDiff} bumpMap={wallBump} bumpScale={0.02} color={wallColor} />
            <Edges color="#9aa0a8" />
          </Box>
        );
      })}

      {/* Openings: door lintel above, window lintel above & sill below */}
      {sorted.map((op, i) => {
        const opMid = wallBase + op.pos + op.width / 2;
        if (op.type === 'door' || op.type === 'garage_door') {
          // Thin lintel above door
          const lintelH = ROOM_HEIGHT - DOOR_H;
          const pos3: [number, number, number] = isHoriz
            ? [opMid, DOOR_H + lintelH / 2, wallFixed]
            : [wallFixed, DOOR_H + lintelH / 2, opMid];
          const args3: [number, number, number] = isHoriz
            ? [op.width, lintelH, wallT]
            : [wallT, lintelH, op.width];
          return (
            <group key={`door_${i}`}>
              <Box args={args3} position={pos3}>
                <meshStandardMaterial map={wallDiff} bumpMap={wallBump} bumpScale={0.02} color={wallColor} />
              </Box>
              {/* Detailed Door leaf (swung open 90 degrees) or Garage roller */}
              {op.type === 'door' && !op.isStairDoor && (() => {
                const dw = op.width * 0.9;
                const hingeCoord = wallBase + op.pos; // Left/Bottom hinge
                const doorT = wallT * 0.25;
                
                const pos3Leaf: [number, number, number] = isHoriz
                  ? [hingeCoord + wallT * 0.125, DOOR_H / 2, wallFixed + dw / 2]
                  : [wallFixed + dw / 2, DOOR_H / 2, hingeCoord + wallT * 0.125];
                
                const panelW = dw * 0.35;
                const panelT = doorT * 0.15;
                
                const pTopH = DOOR_H * 0.20;
                const pMidH = DOOR_H * 0.32;
                const pBotH = DOOR_H * 0.22;
                
                const pY1 = DOOR_H/2 - pTopH/2 - DOOR_H*0.06;
                const pY2 = pY1 - pTopH/2 - pMidH/2 - DOOR_H*0.04;
                const pY3 = pY2 - pMidH/2 - pBotH/2 - DOOR_H*0.04;
                
                const pX1 = -dw/4;
                const pX2 =  dw/4;
                
                const knobR = 0.05;
                const knobY = 0; // Center height
                const knobX = dw/2 - 0.15; // Near edge away from hinge
                
                const doorColor = "#cca677";
                const panelColor = "#d6b589";
                
                return (
                  <group position={pos3Leaf} rotation={isHoriz ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
                    <Box args={[doorT, DOOR_H, dw]}>
                      <meshStandardMaterial color={doorColor} roughness={0.6} />
                    </Box>
                    {[pY1, pY2, pY3].map((py, pi) => (
                      <group key={pi}>
                        <Box args={[doorT + panelT*2, pTopH, panelW]} position={[0, py, pX1]}>
                          <meshStandardMaterial color={panelColor} roughness={0.7} />
                        </Box>
                        <Box args={[doorT + panelT*2, pTopH, panelW]} position={[0, py, pX2]}>
                          <meshStandardMaterial color={panelColor} roughness={0.7} />
                        </Box>
                      </group>
                    ))}
                    <group position={[0, knobY, knobX]}>
                      <Cylinder args={[knobR, knobR, doorT + 0.1, 12]} rotation={[0, 0, Math.PI / 2]}>
                        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
                      </Cylinder>
                      <Sphere args={[knobR * 1.5, 12, 12]} position={[doorT/2 + 0.05, 0, 0]}>
                        <meshStandardMaterial color="#666" metalness={0.9} roughness={0.1} />
                      </Sphere>
                      <Sphere args={[knobR * 1.5, 12, 12]} position={[-doorT/2 - 0.05, 0, 0]}>
                        <meshStandardMaterial color="#666" metalness={0.9} roughness={0.1} />
                      </Sphere>
                    </group>
                  </group>
                );
              })()}
              {op.type === 'garage_door' && (() => {
                const dw = op.width * 0.9;
                const pos3Leaf: [number, number, number] = isHoriz
                  ? [opMid, DOOR_H, wallFixed]
                  : [wallFixed, DOOR_H, opMid];
                return (
                  <group position={pos3Leaf} rotation={isHoriz ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
                    <Cylinder args={[0.3, 0.3, dw, 16]}>
                      <meshStandardMaterial color="#444" roughness={0.6} metalness={0.5} />
                    </Cylinder>
                  </group>
                );
              })()}
            </group>
          );
        } else {
          // Window: sill + glass + lintel
          const pos3Sill: [number, number, number] = isHoriz
            ? [opMid, WIN_SILL / 2, wallFixed]
            : [wallFixed, WIN_SILL / 2, opMid];
          const args3Sill: [number, number, number] = isHoriz
            ? [op.width, WIN_SILL, wallT]
            : [wallT, WIN_SILL, op.width];
          const pos3Lintel: [number, number, number] = isHoriz
            ? [opMid, WIN_SILL + WIN_H + LINTEL_H / 2, wallFixed]
            : [wallFixed, WIN_SILL + WIN_H + LINTEL_H / 2, opMid];
          const args3Lintel: [number, number, number] = isHoriz
            ? [op.width, LINTEL_H, wallT]
            : [wallT, LINTEL_H, op.width];
          const pos3Glass: [number, number, number] = isHoriz
            ? [opMid, WIN_SILL + WIN_H / 2, wallFixed]
            : [wallFixed, WIN_SILL + WIN_H / 2, opMid];
          const args3Glass: [number, number, number] = isHoriz
            ? [op.width, WIN_H, wallT * 0.15]
            : [wallT * 0.15, WIN_H, op.width];
          const frameColor = "#665a6a"; // Dark grayish-purple matching reference
          return (
            <group key={`win_${i}`}>
              <Box args={args3Sill} position={pos3Sill}>
                <meshStandardMaterial map={wallDiff} bumpMap={wallBump} bumpScale={0.02} color={wallColor} />
              </Box>
              <Box args={args3Lintel} position={pos3Lintel}>
                <meshStandardMaterial map={wallDiff} bumpMap={wallBump} bumpScale={0.02} color={wallColor} />
              </Box>
              
              {/* Detailed Window Frame & Physical Glass */}
              <group position={pos3Glass}>
                {/* Physical Glass Material */}
                <Box args={args3Glass}>
                  <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.08} ior={1.5} thickness={0.1} />
                </Box>
                
                {/* 4-Pane Cross Mullions */}
                <Box args={isHoriz ? [op.width, 0.08, wallT * 0.25] : [wallT * 0.25, 0.08, op.width]}>
                  <meshStandardMaterial color={frameColor} roughness={0.7} />
                </Box>
                <Box args={isHoriz ? [0.08, WIN_H, wallT * 0.25] : [wallT * 0.25, WIN_H, 0.08]}>
                  <meshStandardMaterial color={frameColor} roughness={0.7} />
                </Box>
                
                {/* Outer Window Border Frame */}
                <Box args={isHoriz ? [op.width, 0.1, wallT * 0.3] : [wallT * 0.3, 0.1, op.width]} position={[0, WIN_H/2 - 0.05, 0]}>
                  <meshStandardMaterial color={frameColor} roughness={0.7} />
                </Box>
                <Box args={isHoriz ? [op.width, 0.1, wallT * 0.3] : [wallT * 0.3, 0.1, op.width]} position={[0, -WIN_H/2 + 0.05, 0]}>
                  <meshStandardMaterial color={frameColor} roughness={0.7} />
                </Box>
                <Box args={isHoriz ? [0.1, WIN_H, wallT * 0.3] : [wallT * 0.3, WIN_H, 0.1]} position={isHoriz ? [op.width/2 - 0.05, 0, 0] : [0, 0, op.width/2 - 0.05]}>
                  <meshStandardMaterial color={frameColor} roughness={0.7} />
                </Box>
                <Box args={isHoriz ? [0.1, WIN_H, wallT * 0.3] : [wallT * 0.3, WIN_H, 0.1]} position={isHoriz ? [-op.width/2 + 0.05, 0, 0] : [0, 0, -op.width/2 + 0.05]}>
                  <meshStandardMaterial color={frameColor} roughness={0.7} />
                </Box>
              </group>
            </group>
          );
        }
      })}
    </group>
  );
}

// ── Room 3D ──────────────────────────────────────────────────────────────────
function Room3D({ room, allRooms }: { room: Room, allRooms: Room[] }) {
  const n      = room.name.toLowerCase();
  const cx     = room.x + room.width  / 2;
  const cz     = room.y + room.height / 2;



  // Parse doors and windows per wall
  type Opening = { pos: number; width: number; type: 'door' | 'window' | 'garage_door'; isStairDoor?: boolean };
  const wallOpenings: Record<string, Opening[]> = { top: [], bottom: [], left: [], right: [] };
  
  for (const d of (room.doors ?? [])) {
    const wall = d.wall as string;
    let hx = 0, hy = 0;
    if (wall === 'top') { hx = room.x + d.position; hy = room.y; }
    else if (wall === 'bottom') { hx = room.x + d.position; hy = room.y + room.height; }
    else if (wall === 'left') { hx = room.x; hy = room.y + d.position; }
    else if (wall === 'right') { hx = room.x + room.width; hy = room.y + d.position; }

    const hingeX = (wall === 'left' || wall === 'right') ? (wall === 'left' ? room.x : room.x + room.width) : hx;
    const hingeY = (wall === 'top' || wall === 'bottom') ? (wall === 'top' ? room.y : room.y + room.height) : hy;

    const isStairDoor = allRooms.some(r => {
      if (!r.name.toLowerCase().includes('stair')) return false;
      const rx1 = r.x, rx2 = r.x + r.width, ry1 = r.y, ry2 = r.y + r.height;
      return (hingeX >= rx1 - 0.1 && hingeX <= rx2 + 0.1 && hingeY >= ry1 - 0.1 && hingeY <= ry2 + 0.1);
    });

    if (wallOpenings[wall]) wallOpenings[wall].push({ pos: d.position, width: d.width, type: (d as { is_garage?: boolean }).is_garage ? 'garage_door' : 'door', isStairDoor });
  }
  
  for (const w of (room.windows ?? [])) {
    const wall = w.wall as string;
    if (wallOpenings[wall]) wallOpenings[wall].push({ pos: w.position, width: w.width, type: 'window' });
  }

  const mat = getRoomMaterial(room.name);

  // Load floor textures locally to prevent network crashes
  const [floorDiff, floorBump] = useTexture([
    '/assets/textures/hardwood2_diffuse.jpg',
    '/assets/textures/hardwood2_bump.jpg'
  ]);
  
  React.useEffect(() => {
    floorDiff.wrapS = floorDiff.wrapT = THREE.RepeatWrapping;
    floorDiff.repeat.set(room.width / 4, room.height / 4);
    floorDiff.needsUpdate = true;
    floorBump.wrapS = floorBump.wrapT = THREE.RepeatWrapping;
    floorBump.repeat.set(room.width / 4, room.height / 4);
    floorBump.needsUpdate = true;
  }, [floorDiff, floorBump, room.width, room.height]);

  const isBalcony = room.name.toLowerCase().includes('balcony') || 
                    room.name.toLowerCase().includes('terrace') || 
                    room.name.toLowerCase().includes('open area');
  const isParking = room.name.toLowerCase().includes('parking');
  const PARAPET_H = 3.5; // ft — NBC minimum 1.07m ≈ 3.5ft

  if (isBalcony) {
    const wallsWithDoors = (room.doors ?? []).map((d: { wall: string }) => d.wall);
    const edges = ['top', 'bottom', 'left', 'right'];

    return (
      <group>
        {/* Floor slab */}
        <mesh castShadow receiveShadow position={[cx, -0.02, cz]} rotation={[-Math.PI/2, 0, 0]}>
          <planeGeometry args={[room.width, room.height]} />
          <meshPhysicalMaterial
            map={floorDiff}
            bumpMap={floorBump}
            bumpScale={0.015}
            color={mat.floorColor}
            roughness={mat.floorRoughness}
            metalness={0.02}
            clearcoat={mat.floorRoughness < 0.25 ? 0.4 : 0}
            clearcoatRoughness={0.1}
          />
        </mesh>
        
        {/* Outer railing (glass/metal) */}
        {edges.map(edge => {
          if (wallsWithDoors.includes(edge)) return null;
          let rx = cx, rz = cz, w = room.width, d = WALL_T;
          if (edge === 'top') { rz = room.y + WALL_T/2; }
          if (edge === 'bottom') { rz = room.y + room.height - WALL_T/2; }
          if (edge === 'left') { rx = room.x + WALL_T/2; w = WALL_T; d = room.height; }
          if (edge === 'right') { rx = room.x + room.width - WALL_T/2; w = WALL_T; d = room.height; }

          return (
            <group key={edge} position={[rx, PARAPET_H/2, rz]}>
              <Box args={[w, 0.2, d]} position={[0, PARAPET_H/2, 0]} castShadow receiveShadow>
                <meshStandardMaterial color="#333" roughness={0.4} metalness={0.8} />
              </Box>
              <Box args={[edge === 'left' || edge === 'right' ? 0.05 : room.width, PARAPET_H, edge === 'top' || edge === 'bottom' ? 0.05 : room.height]} position={[0, 0, 0]} castShadow>
                <meshPhysicalMaterial color="#aaccff" transmission={0.9} opacity={1} transparent roughness={0.1} />
              </Box>
            </group>
          );
        })}
        
        {/* Room label */}
        <Text position={[cx, PARAPET_H + 0.5, cz]} font="/assets/fonts/Roboto.woff"
              rotation={[-Math.PI/2, 0, 0]} fontSize={1.2}
              color="#333" anchorX="center" anchorY="middle">
          {room.name}
        </Text>
      </group>
    );
  }

  return (
    <group>
      {/* Floor slab — PBR MeshPhysicalMaterial per threejs-materials skill */}
      <mesh castShadow receiveShadow position={[cx, -0.02, cz]} rotation={[-Math.PI/2, 0, 0]}>
        <planeGeometry args={[room.width, room.height]} />
        <meshPhysicalMaterial
          map={floorDiff}
          bumpMap={floorBump}
          bumpScale={0.015}
          color={mat.floorColor}
          roughness={mat.floorRoughness}
          metalness={0.02}
          clearcoat={mat.floorRoughness < 0.25 ? 0.4 : 0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {isParking && (
        <group position={[cx, 0.01, cz]} rotation={[-Math.PI/2, 0, 0]}>
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[room.width * 0.8, room.height * 0.8]} />
            <meshBasicMaterial color="#f0d000" wireframe wireframeLinewidth={3} opacity={0.6} transparent />
          </mesh>
        </group>
      )}

      {/* North wall (top in plan, z = room.y) — horizontal, openings offset from room.x */}
      <WallWithOpenings
        wallLen={room.width} wallBase={room.x} wallFixed={room.y}
        wallT={WALL_T} isHoriz={true}
        openings={wallOpenings.top} wallColor={mat.wallColor}
      />
      {/* South wall (bottom in plan, z = room.y + room.height) */}
      <WallWithOpenings
        wallLen={room.width} wallBase={room.x} wallFixed={room.y + room.height}
        wallT={WALL_T} isHoriz={true}
        openings={wallOpenings.bottom} wallColor={mat.wallColor}
      />
      {/* West wall (left in plan, x = room.x) — vertical, openings offset from room.y */}
      <WallWithOpenings
        wallLen={room.height} wallBase={room.y} wallFixed={room.x}
        wallT={WALL_T} isHoriz={false}
        openings={wallOpenings.left} wallColor={mat.wallColor}
      />
      {/* East wall (right in plan, x = room.x + room.width) */}
      <WallWithOpenings
        wallLen={room.height} wallBase={room.y} wallFixed={room.x + room.width}
        wallT={WALL_T} isHoriz={false}
        openings={wallOpenings.right} wallColor={mat.wallColor}
      />

      {/* Furniture or Stairs */}
      {n.includes('stair') ? (
        <Stairs3D room={room} />
      ) : (
        room.furniture && room.furniture.map((item, i) => (
          <FurnitureItem3D key={i} item={item} roomX={room.x} roomY={room.y} />
        ))
      )}

      {/* Room label (top-down) */}
      <Text font="/assets/fonts/Roboto.woff"
        position={[cx, ROOM_HEIGHT + 0.8, cz]}
        rotation={[-Math.PI/2, 0, 0]}
        fontSize={1.2}
        color="#333"
        anchorX="center" anchorY="middle"
        maxWidth={room.width * 0.9}
      >
        {room.name}
      </Text>
    </group>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ width: '100%', height: '500px', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', borderRadius: '8px' }}>
          <div style={{ textAlign: 'center' }}>
            <h3>WebGL Crash Detected</h3>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>The 3D view failed to load. Your device might be out of VRAM or missing WebGL support.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function FloorPlan3D({ rooms }: FloorPlan3DProps) {
  if (!rooms || rooms.length === 0) return null;

  const minX = Math.min(...rooms.map(r => r.x));
  const minZ = Math.min(...rooms.map(r => r.y));
  const maxX = Math.max(...rooms.map(r => r.x + r.width));
  const maxZ = Math.max(...rooms.map(r => r.y + r.height));

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const maxDim  = Math.max(maxX - minX, maxZ - minZ);

  // Scatter trees around the house perimeter


  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', background: '#0d1117', borderRadius: '8px', overflow: 'hidden' }}>
      <ErrorBoundary>
        <Canvas
          camera={{ position: [centerX + maxDim * 0.55, maxDim * 1.05, centerZ + maxDim * 0.9], fov: 48 }}
          shadows
          gl={{ antialias: true }}
        >
          <React.Suspense fallback={null}>
            <SceneSetup />
            <Sky sunPosition={[centerX + 60, maxDim * 1.8, centerZ + 30]} turbidity={3} rayleigh={0.3} mieCoefficient={0.005} mieDirectionalG={0.8} />
            {/* Environment map removed for stability */}

          {/* Simple Hemisphere & Directional Lights (Removed SoftShadows for stability) */}
          <hemisphereLight args={['#c8d8f0', '#4a6030', 0.7]} />

          <directionalLight
            position={[centerX + maxDim * 0.9, maxDim * 1.6, centerZ + maxDim * 0.6]}
            intensity={1.8}
            color="#fff5e0"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-maxDim * 1.2}
            shadow-camera-right={maxDim * 1.2}
            shadow-camera-top={maxDim * 1.2}
            shadow-camera-bottom={-maxDim * 1.2}
            shadow-camera-near={0.5}
            shadow-camera-far={maxDim * 4}
            shadow-bias={-0.0005}
          />
          <directionalLight
            position={[centerX - maxDim * 0.5, maxDim * 0.5, centerZ - maxDim * 0.4]}
            intensity={0.35}
            color="#d0e8ff"
          />

          {/* Simplified Post-processing (Removed N8AO for stability) */}
          <EffectComposer multisampling={4}>
            <Vignette eskil={false} offset={0.35} darkness={0.6} />
          </EffectComposer>

          <group>
            {rooms.map((r, i) => (
              <Room3D key={i} room={r} allRooms={rooms} />
            ))}
          </group>

          {/* Trees removed for stability */}
          
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.1, centerZ]} receiveShadow>
            <planeGeometry args={[maxDim * 5, maxDim * 5]} />
            <meshStandardMaterial color="#3a6b30" roughness={0.95} metalness={0} />
          </mesh>

          <OrbitControls
            target={[centerX, ROOM_HEIGHT / 2, centerZ]}
            maxPolarAngle={Math.PI / 2 - 0.04}
            minDistance={8}
            maxDistance={maxDim * 3.5}
            enableDamping
            dampingFactor={0.08}
          />
          <gridHelper
            args={[
              Math.ceil(maxDim * 1.6 / 10) * 10,
              Math.ceil(maxDim * 1.6 / 10),
              '#1e2a3a',
              '#111a24'
            ]}
            position={[centerX, -0.25, centerZ]}
          />
          
          <group position={[centerX, 0.01, minZ - 14]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[maxDim * 4, 18]} />
              <meshStandardMaterial color="#252525" roughness={0.88} metalness={0.05} />
            </mesh>
            <mesh position={[0, 0.04, 10.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[maxDim * 4, 4]} />
              <meshStandardMaterial color="#c0bdb8" roughness={0.7} />
            </mesh>
            <Box receiveShadow castShadow args={[maxDim * 4, 0.3, 0.4]} position={[0, 0.15, 8.6]}>
              <meshStandardMaterial color="#a0a0a0" roughness={0.6} />
            </Box>
            {Array.from({ length: 8 }).map((_, i) => (
              <mesh key={i} position={[-maxDim * 1.5 + i * maxDim * 0.44, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[maxDim * 0.2, 0.3]} />
                <meshStandardMaterial color="#f5e642" emissive="#f5e642" emissiveIntensity={0.15} />
              </mesh>
            ))}
            <mesh position={[0, 0.05, 13]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[5, 8]} />
              <meshStandardMaterial color="#a8a49c" roughness={0.6} />
            </mesh>

            <group position={[-maxDim * 0.4, 0, -6]}>
              <mesh position={[0, 6, 0]}>
                <cylinderGeometry args={[0.2, 0.3, 12]} />
                <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[0, 12, 1]}>
                <sphereGeometry args={[0.6]} />
                <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={2} />
              </mesh>
              <pointLight position={[0, 11.5, 1]} intensity={2.5} distance={40} decay={2} color="#fef08a" castShadow />
            </group>
            
            <group position={[maxDim * 0.4, 0, -6]}>
              <mesh position={[0, 6, 0]}>
                <cylinderGeometry args={[0.2, 0.3, 12]} />
                <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[0, 12, 1]}>
                <sphereGeometry args={[0.6]} />
                <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={2} />
              </mesh>
              <pointLight position={[0, 11.5, 1]} intensity={2.5} distance={40} decay={2} color="#fef08a" castShadow />
            </group>
            {/* Car instance in front yard removed for stability */}
          </group>
          </React.Suspense>
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
