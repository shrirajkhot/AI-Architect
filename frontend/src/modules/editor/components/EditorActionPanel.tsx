

interface EditorActionPanelProps {
  currentRoomsLength: number;
  saveLoading: boolean;
  dxfLoading: boolean;
  reportLoading: boolean;
  loading: boolean;
  showCirculation: boolean;
  floorCirculation: boolean;
  showSunlight: boolean;
  hasSunlightResult: boolean;
  show3D: boolean;
  
  onSaveToDatabase: () => void;
  onExportDxf: () => void;
  onExportReport: () => void;
  onGenerate: () => void;
  onToggleCirculation: (v: boolean | ((prev: boolean) => boolean)) => void;
  onToggleSunlight: (v: boolean | ((prev: boolean) => boolean)) => void;
  onToggle3D: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export default function EditorActionPanel({
  currentRoomsLength, saveLoading, dxfLoading, reportLoading, loading,
  showCirculation, floorCirculation, showSunlight, hasSunlightResult, show3D,
  onSaveToDatabase, onExportDxf, onExportReport, onGenerate,
  onToggleCirculation, onToggleSunlight, onToggle3D
}: EditorActionPanelProps) {
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
  };

  const baseBtnStyle = {
    padding: '0.5rem',
    fontSize: '0.8rem',
    borderRadius: '4px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const getToggleStyle = (isActive: boolean, activeColor: string) => ({
    ...baseBtnStyle,
    background: isActive ? `color-mix(in srgb, var(--${activeColor}) 10%, transparent)` : 'var(--bg-card)',
    borderColor: isActive ? `var(--${activeColor})` : 'var(--border-color)',
    color: isActive ? `var(--${activeColor})` : 'var(--text-secondary)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
      <button 
        className="primary-btn" 
        onClick={onSaveToDatabase} 
        disabled={saveLoading || !currentRoomsLength} 
        style={{ width: '100%', padding: '10px', fontSize: '0.9rem' }}
      >
        {saveLoading ? 'Saving...' : '💾 Save to My Plans'}
      </button>
      
      <div style={gridStyle}>
        <button 
          className="btn-ghost" 
          onClick={onExportDxf} 
          disabled={dxfLoading || !currentRoomsLength}
          style={baseBtnStyle}
        >
          {dxfLoading ? '...' : '⬇ DXF'}
        </button>
        <button 
          className="btn-ghost" 
          onClick={onExportReport} 
          disabled={reportLoading || !currentRoomsLength}
          style={baseBtnStyle}
        >
          {reportLoading ? '...' : '📄 Report'}
        </button>
        <button 
          className="btn-ghost" 
          onClick={onGenerate} 
          disabled={loading}
          style={baseBtnStyle}
        >
          {loading ? '...' : '↻ Redraw'}
        </button>
        
        <button
          onClick={() => onToggleCirculation(v => !v)}
          disabled={!floorCirculation}
          title={floorCirculation ? 'Toggle circulation path overlay' : 'Generate a plan to see paths'}
          style={getToggleStyle(showCirculation, 'success')}
        >
          {showCirculation ? '🟢 Paths On' : '🛤 Paths'}
        </button>
        <button
          onClick={() => onToggleSunlight(v => !v)}
          disabled={!hasSunlightResult}
          title={hasSunlightResult ? 'Toggle sunlight overlay' : 'Generate a plan to see sunlight'}
          style={getToggleStyle(showSunlight, 'warning')}
        >
          {showSunlight ? '☀️ Sun On' : '☼ Sunlight'}
        </button>
        <button
          onClick={() => onToggle3D(v => !v)}
          disabled={!currentRoomsLength}
          style={getToggleStyle(show3D, 'accent-color')}
        >
          {show3D ? '2D View' : '3D View'}
        </button>
      </div>
    </div>
  );
}
