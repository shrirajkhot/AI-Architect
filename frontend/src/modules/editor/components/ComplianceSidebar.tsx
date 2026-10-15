import { useState } from 'react';
import type { LayoutData, VastuResult, NbcResult, EnergyResult, SunlightResult, BomResult, VastuFixResult, NbcFixResult, LayoutUpdatePayload } from '../../../shared/api-client/api';
import { vastuFix, nbcFix, recalculateBOM } from '../../../shared/api-client/api';
import toast from 'react-hot-toast';

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

interface ComplianceSidebarProps {
  vastuScore: number;
  vastuResult?: VastuResult;
  nbcResult?: NbcResult;
  energyResult?: EnergyResult;
  sunlightResult?: SunlightResult;
  bomResult?: BomResult;
  layout: Record<string, unknown>;
  plotContext: PlotContext;
  onLayoutUpdate: (data: LayoutUpdatePayload, imageUrl?: string) => void;
  onVastuUpdate?: (newVastuResult: VastuResult, newScore: number) => void;
  onNbcUpdate?: (newNbcResult: NbcResult, newScore: number) => void;
  onAutoSaveRequest?: () => void;
}

export default function ComplianceSidebar({
  vastuScore,
  vastuResult,
  nbcResult,
  energyResult,
  sunlightResult,
  bomResult,
  layout,
  plotContext,
  onLayoutUpdate,
  onVastuUpdate,
  onNbcUpdate,
  onAutoSaveRequest,
}: ComplianceSidebarProps) {
  const [vastuOpen, setVastuOpen] = useState(false);
  const [nbcOpen, setNbcOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);

  const [bomOpen, setBomOpen] = useState(false);
  const [vastuFixing, setVastuFixing] = useState(false);
  const [lastFixResult, setLastFixResult] = useState<VastuFixResult | null>(null);
  const [nbcFixing, setNbcFixing] = useState(false);
  const [lastNbcFixResult, setLastNbcFixResult] = useState<NbcFixResult | null>(null);
  const [tier, setTier] = useState<string>('standard');
  const [bomRecalculating, setBomRecalculating] = useState(false);

  const handleTierChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTier = e.target.value;
    setTier(newTier);
    
    const sqft = plotContext.plotWidth * plotContext.plotHeight;
    setBomRecalculating(true);
    try {
      const res = await recalculateBOM(layout as LayoutData, sqft, newTier);
      onLayoutUpdate({ new_bom_result: res.bomResult });
      toast.success(`BOM updated for ${newTier} finish`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`BOM recalculation failed: ${msg}`);
    } finally {
      setBomRecalculating(false);
    }
  };

  const handleVastuFix = async () => {
    setVastuFixing(true);
    setLastFixResult(null);
    toast.loading('🧭 AI is revising the Vastu topology…', { id: 'vastu-fix' });
    try {
      const result = await vastuFix(layout, vastuResult, plotContext);
      setLastFixResult(result);

      if (result.status === 'already_optimal') {
        toast.success(result.message || 'Layout is already Vastu-optimal!', { id: 'vastu-fix' });
        return;
      }

      if (result.fixed_layout?.length || result.full_layout) {
        onLayoutUpdate(result, result.imageUrl);
        if (onVastuUpdate && result.new_vastu_result) {
          onVastuUpdate(result.new_vastu_result, result.after_score);
        }

        const delta = result.after_score - result.before_score;
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
        toast.success(
          `Vastu improved: ${result.before_score} → ${result.after_score} (${deltaStr})`,
          { id: 'vastu-fix', duration: 5000 }
        );
        if (onAutoSaveRequest) {
          onAutoSaveRequest();
        }
      } else {
        toast.error('Vastu fix did not return a valid layout.', { id: 'vastu-fix' });
      }
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Vastu fix failed: ${msg}`, { id: 'vastu-fix' });
    } finally {
      setVastuFixing(false);
    }
  };

  const handleNbcFix = async () => {
    setNbcFixing(true);
    setLastNbcFixResult(null);
    toast.loading('🏗️ AI is revising the NBC topology...', { id: 'nbc-fix' });
    try {
      const result = await nbcFix(layout, nbcResult, plotContext);
      setLastNbcFixResult(result);

      if (result.status === 'already_optimal') {
        toast.success(result.message || 'Layout is already NBC-optimal!', { id: 'nbc-fix' });
        return;
      }

      if (result.fixed_layout?.length || result.full_layout) {
        onLayoutUpdate(result, result.imageUrl);
        if (onNbcUpdate && result.new_nbc_result) {
          onNbcUpdate(result.new_nbc_result, result.after_score);
        }

        const delta = result.after_score - result.before_score;
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
        toast.success(
          `NBC improved: ${result.before_score} → ${result.after_score} (${deltaStr})`,
          { id: 'nbc-fix', duration: 5000 }
        );
        if (onAutoSaveRequest) {
          onAutoSaveRequest();
        }
      } else {
        toast.error('NBC fix did not return a valid layout.', { id: 'nbc-fix' });
      }
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`NBC fix failed: ${msg}`, { id: 'nbc-fix' });
    } finally {
      setNbcFixing(false);
    }
  };

  const getBadgeColor = (score: number) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--error)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Vastu Panel */}
      {vastuResult && vastuResult.rules.length > 0 && (
        <div className="neu-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div 
            onClick={() => setVastuOpen(!vastuOpen)}
            style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: vastuOpen ? 'var(--input-bg)' : 'transparent', transition: 'all 0.2s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <span style={{ fontSize: '1.2rem' }}>🧭</span> Vastu Analysis
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, color: getBadgeColor(vastuScore), background: 'var(--bg-primary)', boxShadow: 'var(--shadow-inset)' }}>
                {vastuScore}/100
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{vastuOpen ? '▲' : '▼'}</span>
            </div>
          </div>
          
          {vastuOpen && (
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              {vastuScore < 100 && (
                <button
                  onClick={handleVastuFix}
                  disabled={vastuFixing}
                  className="neu-btn"
                  style={{ width: '100%', marginBottom: '1rem', padding: '10px', fontSize: '0.85rem' }}
                >
                  {vastuFixing ? '🧭 Revising topology…' : '✨ Auto-Fix Vastu (AI)'}
                </button>
              )}

              {/* Before/after result banner */}
              {lastFixResult && lastFixResult.status !== 'already_optimal' && (
                <div className="neu-panel-inset" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <strong>Score:</strong> {lastFixResult.before_score} → <strong style={{ color: 'var(--success)' }}>{lastFixResult.after_score}</strong>
                  </div>
                  {lastFixResult.design_rationale && (
                    <div style={{ marginTop: '0.4rem', opacity: 0.8, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{lastFixResult.design_rationale}</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {vastuResult.rules.map((r, i) => {
                  if (r.max === 0) return null;
                  const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
                  return (
                    <div key={i} className="neu-panel-inset" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', alignItems: 'center' }}>
                        <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                          <span>{icon}</span>{r.rule}
                        </strong>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.8rem' }}>{r.points}/{r.max}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, fontSize: '0.75rem' }}>{r.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NBC Compliance Panel */}
      {nbcResult && nbcResult.rules.length > 0 && (
        <div className="neu-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div 
            onClick={() => setNbcOpen(!nbcOpen)}
            style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: nbcOpen ? 'var(--input-bg)' : 'transparent', transition: 'all 0.2s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <span style={{ fontSize: '1.2rem' }}>🏛</span> NBC 2016 Compliance
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, color: getBadgeColor(nbcResult.score), background: 'var(--bg-primary)', boxShadow: 'var(--shadow-inset)' }}>
                {nbcResult.score}/100
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{nbcOpen ? '▲' : '▼'}</span>
            </div>
          </div>
          {nbcOpen && (
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              {nbcResult.score < 100 && (
                <button
                  onClick={handleNbcFix}
                  disabled={nbcFixing}
                  className="neu-btn"
                  style={{ width: '100%', marginBottom: '1rem', padding: '10px', fontSize: '0.85rem' }}
                >
                  {nbcFixing ? '🏗 Revising topology…' : '🔧 Auto-Fix NBC 2016 (AI)'}
                </button>
              )}

              {lastNbcFixResult && lastNbcFixResult.status !== 'already_optimal' && (
                <div className="neu-panel-inset" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <strong>Score:</strong> {lastNbcFixResult.before_score} → <strong style={{ color: 'var(--success)' }}>{lastNbcFixResult.after_score}</strong>
                  </div>
                  {lastNbcFixResult.design_rationale && (
                    <div style={{ marginTop: '0.4rem', opacity: 0.8, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{lastNbcFixResult.design_rationale}</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {nbcResult.rules.map((r, i) => {
                  if (r.max === 0) return null;
                  const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
                  return (
                    <div key={i} className="neu-panel-inset" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', alignItems: 'center' }}>
                        <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                          <span>{icon}</span>{r.rule}
                        </strong>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.8rem' }}>{r.points}/{r.max}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, fontSize: '0.75rem' }}>{r.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Energy & Environment Panel */}
      {((energyResult && energyResult.rules.length > 0) || sunlightResult) && (
        <div className="neu-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div 
            onClick={() => setEnergyOpen(!energyOpen)}
            style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: energyOpen ? 'var(--input-bg)' : 'transparent', transition: 'all 0.2s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <span style={{ fontSize: '1.2rem' }}>🌱</span> Climate & Environmental Analysis
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, color: getBadgeColor(energyResult?.score || sunlightResult?.score || 0), background: 'var(--bg-primary)', boxShadow: 'var(--shadow-inset)' }}>
                {energyResult ? `Grade ${energyResult.grade}` : sunlightResult ? `Grade ${sunlightResult.grade}` : ''}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{energyOpen ? '▲' : '▼'}</span>
            </div>
          </div>
          {energyOpen && (
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                
                {/* Sunlight Insights */}
                {sunlightResult?.insights && sunlightResult.insights.length > 0 && (
                  <>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.5rem' }}>Natural Light Insights</strong>
                    {sunlightResult.insights.map((insight, i) => (
                      <div key={`sun-${i}`} className="neu-panel-inset" style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '1rem', marginTop: '-2px' }}>☀️</span>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, fontSize: '0.8rem' }}>{insight}</div>
                      </div>
                    ))}
                  </>
                )}

                {/* Energy Rules */}
                {energyResult?.rules && energyResult.rules.length > 0 && (
                  <>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.5rem' }}>Efficiency Checklist</strong>
                    {energyResult.rules.map((r, i) => {
                      if (r.max === 0) return null;
                      const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
                      return (
                        <div key={`energy-${i}`} className="neu-panel-inset" style={{ padding: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', alignItems: 'center' }}>
                            <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                              <span>{icon}</span>{r.rule}
                            </strong>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.8rem' }}>{r.points}/{r.max}</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, fontSize: '0.75rem' }}>{r.detail}</div>
                        </div>
                      );
                    })}
                  </>
                )}
                
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Bill of Materials (BOM) Estimation Panel */}
      {bomResult && (
        <div className="neu-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div 
            onClick={() => setBomOpen(!bomOpen)}
            style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: bomOpen ? 'var(--input-bg)' : 'transparent', transition: 'all 0.2s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <span style={{ fontSize: '1.2rem' }}>💰</span> Cost Estimate (BOM)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--success)', background: 'var(--bg-primary)', boxShadow: 'var(--shadow-inset)' }}>
                ₹{bomResult.summary.grand_total.toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{bomOpen ? '▲' : '▼'}</span>
            </div>
          </div>
          {bomOpen && (
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Finish Quality</label>
                    <div style={{ position: 'relative' }}>
                      <select value={tier} onChange={handleTierChange} disabled={bomRecalculating} className="neu-input" style={{ padding: '0.4rem 1.8rem 0.4rem 0.8rem', fontSize: '0.8rem', appearance: 'none', width: '120px' }}>
                          <option value="economy">Economy</option>
                          <option value="standard">Standard</option>
                          <option value="premium">Premium</option>
                      </select>
                      <div style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)', fontSize: '0.6rem' }}>▼</div>
                    </div>
                </div>
                
                {bomRecalculating && <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 600, textAlign: 'center' }}>Recalculating...</div>}
                
                <div className="neu-panel-inset" style={{ padding: '1rem', opacity: bomRecalculating ? 0.5 : 1 }}>
                  <strong style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>Overall Summary (2026 Costs)</strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    <span>Total Area:</span> <strong style={{ color: 'var(--text-primary)' }}>{bomResult.summary.total_area_sqft} sqft</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    <span>Rate per sqft:</span> <strong style={{ color: 'var(--text-primary)' }}>₹{bomResult.summary.rate_per_sqft.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem', marginBottom: '0.4rem' }}>
                    <span>Material Total:</span> <strong style={{ color: 'var(--text-primary)' }}>₹{bomResult.summary.material_total.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Labour Total:</span> <strong style={{ color: 'var(--text-primary)' }}>₹{bomResult.summary.labour_total.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '2px solid var(--border-color)', fontWeight: 800, color: 'var(--accent-color)' }}>
                    <span>Grand Total:</span> <span>₹{bomResult.summary.grand_total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Breakdown</strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {bomResult.rooms.map((room, i) => (
                      <div key={i} className="neu-panel-inset" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', alignItems: 'center' }}>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{room.name}</strong>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.85rem' }}>₹{room.costs.total.toLocaleString('en-IN')}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, fontSize: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.8rem' }}>
                          <span>Area: {room.area_sqft} sqft</span>
                          <span>RCC: ₹{room.costs.structure.toLocaleString('en-IN')}</span>
                          <span>Tiles: ₹{room.costs.flooring.toLocaleString('en-IN')}</span>
                          <span>Paint: ₹{room.costs.painting.toLocaleString('en-IN')}</span>
                          {room.costs.plumbing > 0 && <span>Plumb: ₹{room.costs.plumbing.toLocaleString('en-IN')}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
