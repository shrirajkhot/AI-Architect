import { useState, useEffect, useCallback, useRef } from 'react';

import { generatePlans, exportDxf, exportReport, saveProject, updateProject, getProjectById, regenerateRoom } from '../../../shared/api-client/api';
import toast from 'react-hot-toast';
import type { Room, VastuResult, NbcResult, EnergyResult, SunlightResult, BomResult, LayoutData, LayoutUpdatePayload, Floor } from '../../../shared/api-client/api';
import InteractiveBlueprint from '../components/InteractiveBlueprint';
import FloorPlan3D from '../components/FloorPlan3D';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import RoomEditor from '../components/RoomEditor';
import ComplianceSidebar from '../components/ComplianceSidebar';
import EditorInputPanel from '../components/EditorInputPanel';
import EditorActionPanel from '../components/EditorActionPanel';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/store/AuthContext';

export type ValidationReportEntry = {
  severity?: string;
  room?: string;
  message?: string;
} | string;
interface Plan {
  id: string;
  imageUrl: string;
  layout: LayoutData & { error?: string; floors?: Floor[] };
  vastuScore: number;
  vastuResult?: VastuResult;
  nbcResult?: NbcResult;
  nbcScore?: number;
  energyResult?: EnergyResult;
  sunlightResult?: SunlightResult;
  bomResult?: BomResult;
  circulationWarnings?: string[];
  validationReport?: ValidationReportEntry[];
}

const INITIAL_FORM = {
  length: 40, width: 30, floors: 1,
  duplex: false, bedrooms: 2, bathrooms: 2,
  balcony: 0, terrace: false, lift: false,
  vastuToggle: true, entryDir: 'East',
};

export default function Editor() {
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [dxfLoading, setDxfLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [selectedRoomIndex, setSelectedRoomIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [showCirculation, setShowCirculation] = useState(false);
  const [showSunlight, setShowSunlight] = useState(false);
  const [show3D, setShow3D] = useState(false);

  // Keep a ref always mirroring activeFloorIndex so memoised callbacks
  // don't need it as a dependency and never capture a stale value.
  const activeFloorIndexRef = useRef(0);
  useEffect(() => { activeFloorIndexRef.current = activeFloorIndex; }, [activeFloorIndex]);

  const pendingAutoSaveRef = useRef<boolean>(false);
  const requestAutoSave = useCallback(() => {
    pendingAutoSaveRef.current = true;
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  const openPlan = (plan: Plan) => {
    setActivePlan(plan);
    if (plan.layout?.floors && plan.layout.floors.length > 0) {
      setFloors(plan.layout.floors);
    } else if (plan.layout?.rooms) {
      setFloors([{ level: 'Ground Floor', rooms: plan.layout.rooms }]);
    } else {
      setFloors([]);
    }
    setActiveFloorIndex(0);
    setSelectedRoomIndex(null);
  };

  // Issue 6: memoised so the useEffect dependency array is honest.
  const loadSavedProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const project = await getProjectById(id);
      const restoredPlan: Plan = {
        id: project.id,
        imageUrl: project.image_url || "",
        layout: project.layout_data || { rooms: [] },
        vastuScore: project.layout_data?.vastuScore ?? project.layout_data?.vastuResult?.score ?? 0,
        vastuResult: project.layout_data?.vastuResult,
        nbcResult: project.layout_data?.nbcResult,
        energyResult: project.layout_data?.energyResult,
        sunlightResult: project.layout_data?.sunlightResult,
      };
      if (project.layout_data?.form) {
        setFormData(project.layout_data.form);
      }
      setPlans([restoredPlan]);
      openPlan(restoredPlan);
    } catch (e: unknown) {
      console.error(e);
      setGenError("Failed to load saved project.");
      toast.error("Failed to load saved project.");
    } finally {
      setLoading(false);
    }
  // openPlan is a stable plain function defined above; navigate is stable from react-router
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get("project");
    if (projectId) {
      // eslint-disable-next-line
      loadSavedProject(projectId);
    }
  }, [location.search, loadSavedProject]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? target.checked : type === 'number' ? Number(value) : value,
    }));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setGenError(null);
    try {
      const res = await generatePlans(formData);
      if (res?.candidates?.length) {
        setPlans(prev => [...prev, ...(res.candidates as Plan[])]);
        const first = res.candidates[0] as Plan;
        openPlan(first);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setGenError(msg || 'Generation failed. Check the backend is running.');
      toast.error(msg || 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoomUpdate = useCallback((index: number, updated: Room) => {
    setFloors(prev => {
      const idx = activeFloorIndexRef.current;
      const newFloors = [...prev];
      newFloors[idx] = {
        ...newFloors[idx],
        rooms: newFloors[idx].rooms.map((r, i) => i === index ? updated : r),
        imageUrl: undefined
      };
      return newFloors;
    });
    setSelectedRoomIndex(index);
  }, []);

  // Issue 1: accepts an optional imageUrl so that AI-mutated layouts stay in sync
  // with the concept sketch, PDF export, and database saves.
  // P4: accept full_layout or fallback to room array.
  // targetFloor says which floor `data.rooms` belongs to. It used to be inferred
  // from `Array.isArray(data)`, but LayoutUpdatePayload has no array variant, so
  // that test was always false and every caller silently wrote to floor 0 --
  // dragging a room or running Copilot on an upper floor edited the ground floor.
  // Defaults to 0 because the Vastu/NBC fix routes return ground-floor rooms.
  const handleLayoutUpdate = useCallback((data: LayoutUpdatePayload, imageUrl?: string, targetFloor: number = 0) => {
    const computeNewFloors = (prevFloors: Floor[]) => {
      let newFloors = [...prevFloors];

      if (data && data.full_layout?.floors?.length) {
        newFloors = data.full_layout.floors;
      } else {
        const updatedRooms = data.rooms ?? data.fixed_layout;
        if (!updatedRooms || !Array.isArray(updatedRooms) || updatedRooms.length === 0) {
          return prevFloors;
        }

        const targetIdx = targetFloor;
        if (newFloors[targetIdx]) {
          newFloors[targetIdx] = {
            ...newFloors[targetIdx],
            rooms: JSON.parse(JSON.stringify(updatedRooms)),
          };
        }
      }

      if (imageUrl && newFloors[activeFloorIndexRef.current]) {
        newFloors[activeFloorIndexRef.current] = {
          ...newFloors[activeFloorIndexRef.current],
          imageUrl,
        };
      } else if (!imageUrl && newFloors[activeFloorIndexRef.current]) {
        newFloors[activeFloorIndexRef.current] = {
          ...newFloors[activeFloorIndexRef.current],
          imageUrl: undefined,
        };
      }
      
      return newFloors;
    };

    setFloors(prev => computeNewFloors(prev));
    
    setActivePlan(prevPlan => prevPlan ? {
      ...prevPlan,
      sunlightResult: data.new_sunlight_result || prevPlan.sunlightResult,
      energyResult: data.new_energy_result || prevPlan.energyResult,
      bomResult: data.new_bom_result || prevPlan.bomResult,
      layout: {
        ...prevPlan.layout,
        floors: computeNewFloors(prevPlan.layout?.floors || []),
        sunlightResult: data.new_sunlight_result || prevPlan.layout?.sunlightResult,
        energyResult: data.new_energy_result || prevPlan.layout?.energyResult,
        bomResult: data.new_bom_result || prevPlan.layout?.bomResult,
      },
      ...(imageUrl ? { imageUrl } : {}),
      ...(data.new_energy_result ? { energyResult: data.new_energy_result } : {}),
      ...(data.new_sunlight_result ? { sunlightResult: data.new_sunlight_result } : {}),
      ...(data.new_bom_result ? { bomResult: data.new_bom_result } : {})
    } : prevPlan);
  }, []);

  const handleVastuUpdate = useCallback((result: VastuResult, score: number) => {
    setActivePlan(prev => prev ? {
      ...prev,
      vastuResult: result,
      vastuScore: score
    } : prev);
  }, []);

  const handleNbcUpdate = useCallback((result: NbcResult, score: number) => {
    setActivePlan(prev => prev ? {
      ...prev,
      nbcResult: result,
      nbcScore: score
    } : prev);
  }, []);

  const handleExportDxf = async () => {
    if (!activePlan || !floors.length) return;
    const currentRooms = floors[activeFloorIndex].rooms;
    if (!currentRooms.length) return;
    setDxfLoading(true);
    try {
      await exportDxf(
        currentRooms, 
        `${activePlan.id}_${floors[activeFloorIndex].level.replace(/\s+/g, '_')}`,
        plotContext.plotWidth,
        plotContext.plotHeight
      );
      toast.success(
        '✅ DXF downloaded — Scale: 1 unit = 1 ft = 304.8 mm (AutoCAD units: mm). ' +
        'Verify units in AutoCAD with UNITS command before printing.',
        { duration: 6000 }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`DXF export failed: ${msg}`);
    } finally {
      setDxfLoading(false);
    }
  };

  const handleExportReport = async () => {
    if (!activePlan || !floors.length) return;
    setReportLoading(true);
    toast.loading('📄 Generating PDF report…', { id: 'report-gen' });
    try {
      const bhk    = formData.bedrooms;
      const dir    = formData.entryDir.charAt(0).toUpperCase() + formData.entryDir.slice(1);
      const dupTag = formData.duplex ? ' Duplex' : '';
      const meta   = {
        name:      `${bhk}BHK${dupTag} ${dir}-facing ${formData.length}\u00d7${formData.width}ft`,
        length:    formData.length,
        width:     formData.width,
        bedrooms:  formData.bedrooms,
        bathrooms: formData.bathrooms,
        entry_dir: formData.entryDir,
        vastu:     formData.vastuToggle,
      };
      // Merge all analysis results into layout so the premium PDF
      // generator can include NBC, Energy, Sunlight sections.
      const enrichedLayout = {
        ...activePlan.layout,
        floors,                                          // current floor state (with images)
        nbcResult:      activePlan.nbcResult,
        energyResult:   activePlan.energyResult,
        sunlightResult: activePlan.sunlightResult,
        bomResult:      activePlan.bomResult,
        vastuScore:     activePlan.vastuScore,
      };
      await exportReport(
        enrichedLayout,
        activePlan.vastuResult,
        activePlan.id,
        meta,
      );
      toast.success('✅ Architectural report downloaded!', { id: 'report-gen' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Report failed: ${msg}`, { id: 'report-gen' });
    } finally {
      setReportLoading(false);
    }
  };

  const handleCopilotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotInput.trim() || !activePlan || !floors.length) return;
    
    setCopilotLoading(true);
    toast.loading('🤖 Copilot is redesigning...', { id: 'copilot' });
    try {
      const targetRoomName = selectedRoomIndex !== null ? currentRooms[selectedRoomIndex].name : 'General';
      const res = await regenerateRoom(currentRooms, targetRoomName, copilotInput, plotContext);
      
      if (res.rooms || res.full_layout) {
        toast.success(`✅ Copilot updated layout!\n${res.design_rationale || ''}`, { id: 'copilot', duration: 5000 });
        // Copilot was given the active floor's rooms, so its result belongs there.
        handleLayoutUpdate(res, res.imageUrl, activeFloorIndexRef.current);
        setCopilotInput('');
      } else {
        toast.error('Copilot failed to generate a valid layout.', { id: 'copilot' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Copilot error: ${msg}`, { id: 'copilot' });
    } finally {
      setCopilotLoading(false);
    }
  };

  useEffect(() => {
    if (pendingAutoSaveRef.current && activePlan?.id && floors.length > 0) {
      pendingAutoSaveRef.current = false;
      const doAutoSave = async () => {
        try {
          const bhk = formData.bedrooms;
          const dir = formData.entryDir.charAt(0).toUpperCase() + formData.entryDir.slice(1);
          const dupTag = formData.duplex ? ' Duplex' : '';
          const projectName = `${bhk}BHK${dupTag} ${dir}-facing ${formData.length}\u00d7${formData.width}ft`;

          const payload = {
            name: projectName,
            layout_data: { 
              floors,
              form: formData,
              vastuScore: activePlan.vastuScore,
              vastuResult: activePlan.vastuResult,
              nbcResult: activePlan.nbcResult,
              energyResult: activePlan.energyResult,
              sunlightResult: activePlan.sunlightResult,
            },
            image_url: activePlan.imageUrl
          };

          // A real MongoDB ObjectId is exactly 24 hex characters.
          // In-memory generated IDs (e.g. "plan_3e29e3dc") are not ObjectIds
          // and will never be found by the backend PUT — so POST first to
          // create the record, then patch the plan id so future saves use PUT.
          const isDbId = /^[0-9a-f]{24}$/i.test(activePlan.id);
          if (isDbId) {
            await updateProject(activePlan.id, payload);
          } else {
            const created = await saveProject(payload);
            // Patch the in-memory plan id so subsequent auto-saves use PUT
            setActivePlan(prev => prev ? { ...prev, id: created.id } : prev);
          }
          toast.success('Design automatically saved!', { id: 'auto-save', position: 'bottom-right' });
        } catch (e) {
          console.error('Auto-save failed:', e);
          toast.error('Auto-save failed. Your changes may not be saved.', { id: 'auto-save-err', duration: 3000 });
        }
      };
      doAutoSave();
    }
  }, [activePlan, floors, formData]);

  const handleSaveToDatabase = async () => {
    if (!activePlan || !floors.length) return;
    setSaveLoading(true);
    try {
      const bhk = formData.bedrooms;
      const dir = formData.entryDir.charAt(0).toUpperCase() + formData.entryDir.slice(1);
      const dupTag = formData.duplex ? ' Duplex' : '';
      const projectName = `${bhk}BHK${dupTag} ${dir}-facing ${formData.length}×${formData.width}ft`;

      const payload = {
        name: projectName,
        layout_data: { 
          floors,
          form: formData,
          vastuScore: activePlan.vastuScore,
          vastuResult: activePlan.vastuResult,
          nbcResult: activePlan.nbcResult,
          energyResult: activePlan.energyResult,
          sunlightResult: activePlan.sunlightResult,
        },
        image_url: activePlan.imageUrl
      };

      const isDbId = /^[0-9a-f]{24}$/i.test(activePlan.id);
      if (isDbId) {
        await updateProject(activePlan.id, payload);
        toast.success('Design updated!');
      } else {
        const created = await saveProject(payload);
        // Patch the active plan in case they stay on the page
        setActivePlan(prev => prev ? { ...prev, id: created.id } : prev);
        toast.success('Design saved to My Plans!');
        navigate('/dashboard');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const currentRooms     = floors[activeFloorIndex]?.rooms       || [];
  const floorCirculation = floors[activeFloorIndex]?.circulation ?? null;
  const currentLayout    = activePlan?.layout as Record<string, unknown> | undefined;

  const plotContext = {
    // plotWidth/plotHeight are the x/y extents of the drafted plan, which the
    // drafter lays out as x over `width` and y over `length` -- not the raw form
    // fields in form order. Sending them transposed made the DXF plot boundary
    // and every compass-zone score disagree with the room coordinates.
    plotWidth:  formData.width,
    plotHeight: formData.length,
    entryDir:   formData.entryDir,
    bedrooms:   formData.bedrooms,
    bathrooms:  formData.bathrooms,
    floors:     formData.floors,
    balcony:    formData.balcony,
    terrace:    formData.terrace ? 1 : 0,
    lift:       formData.lift ? 1 : 0,
  };


  return (
    <div className="app-container" style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      
      {/* ── Header ── */}
      <header style={{
        padding: '1.25rem 2.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-primary)',
        boxShadow: 'var(--shadow-elevated)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: '1rem',
      }}>
        {/* Left: back + logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="neu-btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            ← Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.4rem', color: 'var(--accent-color)', fontWeight: 800 }}>⬡</span>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>AI Architect</span>
            <span style={{ padding: '0.2rem 0.6rem', background: 'var(--input-bg)', boxShadow: 'var(--shadow-inset)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em' }}>EDITOR</span>
          </div>
        </div>

        {/* Right: theme toggle + user info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {user?.name || 'Architect'}
          </span>
          <button className="neu-btn-ghost" onClick={() => {
            localStorage.removeItem('token');
            navigate('/login');
          }} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            Logout
          </button>
        </div>
      </header>

      <div className={`content-grid ${activePlan ? 'active-plan-view' : ''}`}>
        {/* ── Sidebar Form ── */}
        <aside className="neu-panel panel-scroll-area" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Requirements</h2>

          <EditorInputPanel
            formData={formData}
            onChange={handleChange}
            loading={loading}
            onGenerate={handleGenerate}
          />

          {genError && <p className="gen-error" style={{ color: 'var(--error)', marginTop: '1rem', fontSize: '0.9rem' }}>⚠ {genError}</p>}

          {plans.length > 0 && !loading && (
            <div style={{ marginTop: '2rem' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Current Session</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {plans.map(p => (
                  <button
                    key={p.id}
                    className={activePlan?.id === p.id ? "neu-panel-inset" : "neu-panel"}
                    onClick={() => openPlan(p)}
                    style={{
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      border: 'none',
                      color: activePlan?.id === p.id ? 'var(--accent-color)' : 'var(--text-primary)'
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formData.bedrooms}BHK · {formData.entryDir.charAt(0).toUpperCase() + formData.entryDir.slice(1)} · {formData.length}×{formData.width}ft</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{p.id.slice(0, 8)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main Workspace & Analytics (or Gallery) ── */}
        {activePlan ? (
          <>
            {/* Center Panel: Interactive Blueprint & Concept Sketch */}
            <section className="workspace-pane panel-scroll-area neu-panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: 'var(--bg-primary)', boxShadow: '0 4px 6px -4px rgba(163,177,198,0.3)', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Interactive Blueprint</p>
                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--input-bg)', borderRadius: '4px', boxShadow: 'var(--shadow-inset)', color: 'var(--text-secondary)', fontWeight: 600 }}>{activePlan.id}</span>
                </div>
                
                {floors.length > 1 && (
                  <div style={{ display: 'flex', gap: '0.75rem', background: 'var(--input-bg)', padding: '0.25rem', borderRadius: '8px', boxShadow: 'var(--shadow-inset)' }}>
                    {floors.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => { setActiveFloorIndex(i); setSelectedRoomIndex(null); }}
                        className={i === activeFloorIndex ? "neu-panel" : ""}
                        style={{
                          padding: '0.4rem 1rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: i === activeFloorIndex ? 'var(--bg-primary)' : 'transparent',
                          color: i === activeFloorIndex ? 'var(--accent-color)' : 'var(--text-secondary)',
                          boxShadow: i === activeFloorIndex ? 'var(--shadow-elevated)' : 'none',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          transition: 'all 0.2s'
                        }}
                      >
                        {f.level}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ minHeight: '60vh', flexShrink: 0, position: 'relative', background: 'var(--input-bg)', boxShadow: 'var(--shadow-inset)', overflow: 'hidden' }}>
                {currentRooms.length > 0
                  ? (
                    show3D ? (
                      <ErrorBoundary fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)' }}>Failed to load 3D view. WebGL may have crashed.</div>}>
                        <FloorPlan3D rooms={currentRooms} entryDir={plotContext.entryDir} />
                      </ErrorBoundary>
                    ) : (
                      <InteractiveBlueprint
                        rooms={currentRooms}
                        selectedRoom={selectedRoomIndex !== null ? currentRooms[selectedRoomIndex] : null}
                        onRoomSelect={(_room, idx) => setSelectedRoomIndex(idx)}
                        onRoomDrop={(rooms, img) => handleLayoutUpdate({ rooms }, img, activeFloorIndexRef.current)}
                        circulation={floorCirculation}
                        showCirculation={showCirculation}
                        sunlightResult={activePlan.sunlightResult}
                        showSunlight={showSunlight}
                        entryDir={plotContext.entryDir}
                        floorIndex={activeFloorIndex}
                      />
                    )
                  )
                  : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}><p>No layout data for this floor.</p></div>
                }
              </div>

              {/* Large Concept Sketch — fixed height so it never zooms when the right sidebar panels (BOM, Energy) expand */}
              <div style={{ padding: '1rem', background: 'var(--bg-primary)', flexShrink: 0 }}>
                <p style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Concept Sketch</p>
                <div className="neu-panel-inset" style={{ width: '100%', height: '320px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0' }}>
                  <img
                    src={floors[activeFloorIndex]?.imageUrl || activePlan.imageUrl}
                    alt="Concept sketch"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: '8px' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              </div>
            </section>

            {/* Right Panel: Analytics & Actions */}
            <aside className="neu-panel panel-scroll-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>

              {/* Header: close + score */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem' }}>
                <button className="neu-btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setActivePlan(null)}>← Close</button>
                <div className="neu-panel-inset" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 800, color: activePlan.vastuScore >= 60 ? 'var(--success)' : (activePlan.vastuScore >= 40 ? 'var(--warning)' : 'var(--error)') }}>
                  Vastu {activePlan.vastuScore}/100
                </div>
              </div>

              <ComplianceSidebar
                vastuScore={activePlan.vastuScore}
                vastuResult={activePlan.vastuResult}
                nbcResult={activePlan.nbcResult}
                energyResult={activePlan.energyResult}
                sunlightResult={activePlan.sunlightResult}
                bomResult={activePlan.bomResult}
                layout={currentLayout ?? {}}
                plotContext={plotContext}
                onLayoutUpdate={handleLayoutUpdate}
                onVastuUpdate={handleVastuUpdate}
                onNbcUpdate={handleNbcUpdate}
                onAutoSaveRequest={requestAutoSave}
              />

              {/* Action bar */}
              <EditorActionPanel
                currentRoomsLength={currentRooms.length}
                saveLoading={saveLoading}
                dxfLoading={dxfLoading}
                reportLoading={reportLoading}
                loading={loading}
                showCirculation={showCirculation}
                floorCirculation={!!floorCirculation}
                showSunlight={showSunlight}
                hasSunlightResult={!!activePlan?.sunlightResult}
                show3D={show3D}
                onSaveToDatabase={handleSaveToDatabase}
                onExportDxf={handleExportDxf}
                onExportReport={handleExportReport}
                onGenerate={handleGenerate}
                onToggleCirculation={setShowCirculation}
                onToggleSunlight={setShowSunlight}
                onToggle3D={setShow3D}
              />

              {/* Copilot Chat UI */}
              <div className="neu-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
                <p style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>✨</span> AI Copilot
                </p>
                <div className="neu-panel-inset" style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Describe changes to the layout. The AI will recalculate topology and generate a new blueprint.
                </div>
                <form onSubmit={handleCopilotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <textarea
                    rows={3}
                    value={copilotInput}
                    onChange={e => setCopilotInput(e.target.value)}
                    placeholder="e.g. Add an attached bath to the Master Bedroom..."
                    disabled={copilotLoading || !currentRooms.length}
                    className="neu-input"
                    style={{ 
                      resize: 'none', 
                      opacity: (!currentRooms.length || copilotLoading) ? 0.6 : 1,
                      cursor: (!currentRooms.length || copilotLoading) ? 'not-allowed' : 'text'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="neu-btn" disabled={copilotLoading || !copilotInput.trim()} style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}>
                      {copilotLoading ? 'Generating...' : '↑ Send to Copilot'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Room Editor — slides in below actions when a room is selected */}
                {selectedRoomIndex !== null && currentRooms[selectedRoomIndex] ? (
                  <div className="neu-panel" style={{ padding: '1.5rem', marginTop: '0.5rem' }}>
                    <RoomEditor
                      room={currentRooms[selectedRoomIndex]}
                      index={selectedRoomIndex}
                      allRooms={currentRooms}
                      plotContext={plotContext}
                      onRoomUpdate={handleRoomUpdate}
                      onLayoutUpdate={(data, img) => handleLayoutUpdate(data, img, activeFloorIndexRef.current)}
                      onClose={() => setSelectedRoomIndex(null)}
                    />
                  </div>
                ) : null}

              {/* Circulation Warning — sourced from the computed floor circulation data */}
              {(() => {
                const unreachable = floorCirculation?.unreachable ?? activePlan.circulationWarnings ?? [];
                return unreachable.length > 0 ? (
                  <div className="neu-panel-inset" style={{ padding: '1rem', color: 'var(--warning)', fontWeight: 600 }}>
                    <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>⚠️</span> <strong>Circulation Warning:</strong>{' '}
                    {unreachable.length} room(s) unreachable: {unreachable.join(', ')}
                  </div>
                ) : null;
              })()}

              {/* Validation Report */}
              <details className="neu-panel" style={{ padding: '1rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                {(() => {
                  const realIssues = (activePlan.validationReport ?? []).filter(
                    (e: ValidationReportEntry) => {
                      if (typeof e === 'string') return true;
                      return !(e.severity === 'info' && (e.room === '-' || e.message?.toLowerCase().includes('no issues')));
                    }
                  );
                  return (
                    <>
                      <summary style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🔧 Auto-Corrections ({realIssues.length})</summary>
                      <ul style={{ margin: 0, padding: '1rem 0 0 1.5rem', color: 'var(--text-secondary)' }}>
                        {realIssues.length === 0 ? (
                          <li>[INFO] -: No issues found.</li>
                        ) : (
                          realIssues.map((entry: ValidationReportEntry, i: number) => (
                            <li key={i} style={{ marginBottom: '0.4rem' }}>
                              {typeof entry === 'string'
                                ? entry
                                : `[${entry.severity?.toUpperCase() || 'INFO'}] ${entry.room}: ${entry.message}`}
                            </li>
                          ))
                        )}
                      </ul>
                    </>
                  );
                })()}
              </details>


            </aside>
            
          </>
        ) : plans.length > 0 ? (
          <main className="neu-panel panel-scroll-area" style={{ padding: '1.5rem' }}>
            <p style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Generated Plans — click to inspect</p>
            <div className="gallery" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2rem' }}>
              {plans.map(plan => (
                <div key={plan.id} className="neu-panel" onClick={() => openPlan(plan)} style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
                  <div style={{ height: '220px', background: 'var(--input-bg)', boxShadow: 'var(--shadow-inset)', position: 'relative' }}>
                    <img src={plan.imageUrl} alt="Concept" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{plan.id.slice(0, 8)}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-color)' }}>{plan.vastuScore} Vastu</span>
                  </div>
                </div>
              ))}
            </div>
          </main>
        ) : (
          <main className="neu-panel panel-scroll-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '4rem 2rem' }}>
            <div className="neu-panel-inset" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 3rem', maxWidth: '600px', width: '100%' }}>
              <div style={{ fontSize: '4.5rem', color: 'var(--accent-color)', marginBottom: '1.5rem', filter: 'drop-shadow(2px 4px 6px rgba(163,177,198,0.4))' }}>⬡</div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>No Plans Yet</h2>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 2.5rem', lineHeight: 1.6, fontSize: '1.05rem' }}>Configure your requirements on the left and click <strong style={{ color: 'var(--text-primary)' }}>Generate Plans</strong> to get started.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', textAlign: 'left', width: '100%' }}>
                <div className="neu-panel" style={{ padding: '1.25rem' }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem', fontSize: '0.95rem' }}>🤖 Generative Layouts</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gemini calculates precise rooms.</span>
                </div>
                <div className="neu-panel" style={{ padding: '1.25rem' }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem', fontSize: '0.95rem' }}>🗂 Export to CAD</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Download perfectly scaled DXFs.</span>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
