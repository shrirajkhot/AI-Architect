import React from 'react';
import { Layers, Sun, ArrowUpDown, Car, Compass } from 'lucide-react';

export interface EditorFormData {
  length: number;
  width: number;
  floors: number;
  duplex: boolean;
  bedrooms: number;
  bathrooms: number;
  balcony: number;
  terrace: boolean;
  lift: boolean;
  vastuToggle: boolean;
  entryDir: string;
}

interface EditorInputPanelProps {
  formData: EditorFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  loading: boolean;
  onGenerate: () => void;
}

export default function EditorInputPanel({ formData, onChange, loading, onGenerate }: EditorInputPanelProps) {
  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--input-border)',
    borderRadius: '4px',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    boxShadow: 'var(--shadow-sm)',
    outline: 'none',
  };

  const labelStyle = {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '0.25rem',
    display: 'block',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em'
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="form-group">
          <label style={labelStyle}>Length (ft)</label>
          <input type="number" name="length" min={15} value={formData.length} onChange={onChange} style={inputStyle} />
        </div>
        <div className="form-group">
          <label style={labelStyle}>Width (ft)</label>
          <input type="number" name="width" min={15} value={formData.width} onChange={onChange} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="form-group">
          <label style={labelStyle}>Floors</label>
          <input type="number" name="floors" min={1} max={10} value={formData.floors} onChange={onChange} style={inputStyle} />
        </div>
        <div className="form-group">
          <label style={labelStyle}>Bedrooms</label>
          <input type="number" name="bedrooms" min={1} value={formData.bedrooms} onChange={onChange} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="form-group">
          <label style={labelStyle}>Baths</label>
          <input type="number" name="bathrooms" min={1} value={formData.bathrooms} onChange={onChange} style={inputStyle} />
        </div>
        <div className="form-group">
          <label style={labelStyle}>Balconies</label>
          <input type="number" name="balcony" min={0} value={formData.balcony} onChange={onChange} style={inputStyle} />
        </div>
      </div>

      <div className="form-group">
        <label style={labelStyle}>Entry Direction</label>
        <select name="entryDir" value={formData.entryDir} onChange={onChange} style={inputStyle}>
          <option value="east">East (E)</option>
          <option value="west">West (W)</option>
          <option value="north">North (N)</option>
          <option value="south">South (S)</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
        {([
          ['duplex', 'Duplex', <Layers size={16} />],
          ['terrace', 'Terrace', <Sun size={16} />],
          ['lift', 'Lift', <ArrowUpDown size={16} />],
          ['parking', 'Parking', <Car size={16} />],
          ['vastuToggle', 'Vastu', <Compass size={16} />],
        ] as [string, string, React.ReactNode][]).map(([name, label, icon]) => {
          const isChecked = formData[name as keyof typeof formData] as boolean;
          return (
            <label key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                {icon}
                {label}
              </span>
              <div style={{
                width: '36px', height: '20px', borderRadius: '10px',
                background: isChecked ? 'var(--accent-color)' : 'var(--border-color)',
                position: 'relative',
                transition: 'background 0.2s ease'
              }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: '#FFFFFF',
                  position: 'absolute',
                  top: '2px',
                  left: isChecked ? '18px' : '2px',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }} />
              </div>
              <input
                type="checkbox"
                name={name}
                checked={isChecked}
                onChange={onChange}
                style={{ display: 'none' }}
              />
            </label>
          );
        })}
      </div>

      <button
        id="generate-btn"
        className="primary-btn"
        onClick={onGenerate}
        disabled={loading}
        style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: '1rem' }}
      >
        {loading
          ? <><span className="btn-spinner" style={{ marginRight: '8px' }} /> Generating…</>
          : 'Generate Plans'}
      </button>
    </div>
  );
}

