import React, { useState, useEffect, useRef } from 'react';
import { regenerateRoom, type Room, type LayoutUpdatePayload } from '../../../shared/api-client/api';
import { validateRoomPlacement } from '../../../shared/utils/validateRooms';
import { toast } from 'react-hot-toast';

interface PlotContext {
  plotWidth: number;
  plotHeight: number;
  entryDir: string;
  bedrooms: number;
  bathrooms: number;
  floors: number;
  balcony: number;
  terrace: number;
  lift: number;
}

interface Props {
  room: Room;
  index: number;
  allRooms: Room[];
  plotContext: PlotContext;
  onRoomUpdate: (index: number, updated: Room) => void;
  onLayoutUpdate: (data: LayoutUpdatePayload, imageUrl?: string) => void;
  onClose: () => void;
}

type NumericRoomKey = 'x' | 'y' | 'width' | 'height';

const FIELD_LABELS: Record<NumericRoomKey, string> = {
  x: 'X Offset (ft)',
  y: 'Y Offset (ft)',
  width: 'Width (ft)',
  height: 'Height (ft)',
};

const RoomEditor: React.FC<Props> = ({ room, index, allRooms, plotContext, onRoomUpdate, onLayoutUpdate, onClose }) => {
  const [local, setLocal] = useState<Room>({ ...room });
  const [prevRoomName, setPrevRoomName] = useState(room.name);
  const [instruction, setInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (room.name !== prevRoomName) {
    setPrevRoomName(room.name);
    setLocal({ ...room });
    setInstruction('');
    setAiError(null);
    setAiSuccess(false);
  }

  const handleFieldChange = (field: NumericRoomKey, val: number) => {
    setLocal(prev => ({ ...prev, [field]: val }));
  };

  const handleApply = () => {
    const newRooms = allRooms.map((r, i) => i === index ? local : r);
    const violations = validateRoomPlacement(newRooms, plotContext.plotWidth, plotContext.plotHeight);
    if (violations.length > 0) {
      toast.error(violations[0].reason);
      return;
    }
    onRoomUpdate(index, local);
  };

  const handleReset = () => {
    setLocal({ ...room });
  };

  const handleAskAI = async () => {
    if (!instruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiSuccess(false);
    try {
      const res = await regenerateRoom(allRooms, room.name, instruction, plotContext);
      if (res?.rooms?.length || res?.full_layout) {
        onLayoutUpdate(res, res.imageUrl);
        setInstruction('');
        setAiSuccess(true);
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => { setAiSuccess(false); }, 3000);
      } else {
        setAiError('AI returned an unexpected response.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg || 'AI editing failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: getRoomDotColor(room.name), boxShadow: 'var(--shadow-elevated)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{room.name}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{room.width} × {room.height} ft</span>
          </div>
        </div>
        <button className="neu-btn-ghost" onClick={onClose} title="Close editor" style={{ padding: '0.4rem', fontSize: '1rem', borderRadius: '8px' }}>✕</button>
      </div>

      {/* Numeric precision editing */}
      <div className="neu-panel-inset" style={{ padding: '1.25rem' }}>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Precise Dimensions</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {(Object.keys(FIELD_LABELS) as NumericRoomKey[]).map(field => (
            <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{FIELD_LABELS[field]}</label>
              <input
                type="number"
                className="neu-input"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                value={local[field]}
                min={field === 'width' || field === 'height' ? 4 : 0}
                step={0.5}
                onChange={e => handleFieldChange(field, parseFloat(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="neu-btn" onClick={handleApply} style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }}>✓ Apply</button>
          <button className="neu-btn-ghost" onClick={handleReset} style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }}>↺ Reset</button>
        </div>
      </div>

      {/* AI natural language editing */}
      <div className="neu-panel-inset" style={{ padding: '1.25rem' }}>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>✦ AI Assistant</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            className="neu-input"
            placeholder={`e.g. "Make the ${room.name} 3 ft wider"`}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !aiLoading && handleAskAI()}
            disabled={aiLoading}
            style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}
          />
          <button
            className="neu-btn"
            onClick={handleAskAI}
            disabled={aiLoading || !instruction.trim()}
            style={{ 
              width: '100%', padding: '0.6rem', fontSize: '0.85rem',
              color: aiSuccess ? 'var(--success)' : undefined
            }}
          >
            {aiLoading ? 'Thinking...' : aiSuccess ? '✓ Applied!' : 'Ask AI'}
          </button>
        </div>
        {aiError && <p style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 500 }}>⚠ {aiError}</p>}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.75rem', lineHeight: 1.4 }}>
          AI will recalculate the entire floor plan to fulfil your request.
        </p>
      </div>
    </div>
  );
};

function getRoomDotColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bedroom')) return '#3b82f6';
  if (n.includes('bath') || n.includes('toilet')) return '#06b6d4';
  if (n.includes('kitchen')) return '#f97316';
  if (n.includes('living') || n.includes('lounge') || n.includes('hall')) return '#8b5cf6';
  if (n.includes('dining')) return '#ec4899';
  if (n.includes('balcony') || n.includes('terrace')) return '#10b981';
  return '#64748b';
}

export default RoomEditor;
