const API_BASE_URL = "http://localhost:8000";


interface FurnitureItem {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DoorSpec {
  wall: 'top' | 'bottom' | 'left' | 'right';
  position: number;
  width: number;
}

export interface WindowSpec {
  wall: 'top' | 'bottom' | 'left' | 'right';
  position: number;
  width: number;
}

export interface Room {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  furniture?: FurnitureItem[];
  doors?: DoorSpec[];
  windows?: WindowSpec[];
}

export interface VastuRule {
  rule: string;
  status: 'pass' | 'warn' | 'fail';
  points: number;
  max: number;
  detail: string;
}

export interface VastuResult {
  score: number;
  grade: string;
  rules: VastuRule[];
}

export interface VastuFixResult {
  status: string;
  before_score: number;
  after_score: number;
  new_vastu_result?: VastuResult;
  fixed_layout?: Room[];
  full_layout?: { floors: Floor[] };
  design_rationale?: string;
  converged?: boolean;
  message?: string;
  imageUrl?: string;
  new_energy_result?: EnergyResult;
  new_sunlight_result?: SunlightResult;
  new_bom_result?: BomResult;
}

export interface NbcFixResult {
  status: string;
  before_score: number;
  after_score: number;
  new_nbc_result?: NbcResult;
  fixed_layout?: Room[];
  full_layout?: { floors: Floor[] };
  design_rationale?: string;
  converged?: boolean;
  message?: string;
  imageUrl?: string;
  new_energy_result?: EnergyResult;
  new_sunlight_result?: SunlightResult;
  new_bom_result?: BomResult;
}

export interface NbcRule {
  rule: string;
  status: 'pass' | 'warn' | 'fail';
  points: number;
  max: number;
  detail: string;
}

export interface NbcResult {
  score: number;
  grade: string;
  rules: NbcRule[];
}

export interface EnergyRule {
  rule: string;
  status: 'pass' | 'warn' | 'fail';
  points: number;
  max: number;
  detail: string;
}

export interface EnergyResult {
  score: number;
  grade: string;
  rules: EnergyRule[];
}

export interface SunlightRule {
  rule: string;
  status: 'pass' | 'warn' | 'fail';
  points: number;
  max: number;
  detail: string;
}

export interface SunlightResult {
  score: number;
  grade: string;
  rules: SunlightRule[];
  insights: string[];
  windows_sunlight: Record<string, { direction: string; intensity: number }>;
}

export interface BomRoomCost {
  wall: number;
  flooring: number;
  ceiling: number;
  electrical: number;
  plumbing: number;
  painting: number;
  doors: number;
  windows: number;
  structure: number;
  material: number;
  labour: number;
  total: number;
}

export interface BomRoom {
  name: string;
  area_sqft: number;
  wall_area_sqft: number;
  num_doors: number;
  num_windows: number;
  costs: BomRoomCost;
}

export interface BomSummary {
  total_area_sqft: number;
  material_total: number;
  labour_total: number;
  grand_total: number;
  rate_per_sqft: number;
}

export interface BomResult {
  rooms: BomRoom[];
  summary: BomSummary;
}

export interface CirculationPath {
  to: string;
  waypoints: [number, number][];
}

export interface FloorCirculation {
  paths: CirculationPath[];
  unreachable: string[];
}

export interface Floor {
  level: string;
  rooms: Room[];
  imageUrl?: string;
  circulation?: FloorCirculation;
}

export interface LayoutUpdatePayload {
  rooms?: Room[];
  fixed_layout?: Room[];
  full_layout?: { floors: Floor[] };
  imageUrl?: string;
  status?: string;
  design_rationale?: string;
  new_energy_result?: EnergyResult;
  new_sunlight_result?: SunlightResult;
  new_bom_result?: BomResult;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────
export interface RegisterPayload { email: string; password: string; name?: string; }
export interface LoginPayload { email: string; password: string; }

export interface SaveProjectPayload {
  name: string;
  layout_data: LayoutData;
  image_url?: string;
}

export interface GeneratePlansPayload {
  length: number;
  width: number;
  bedrooms: number;
  bathrooms: number;
  floors: number;
  duplex: boolean;
  balcony: number;
  terrace: boolean;
  lift: boolean;
  vastuToggle: boolean;
  entryDir: string;
}

export interface LayoutData {
  form?: Record<string, unknown>;
  rooms?: Room[];
  plot_width?: number;
  plot_height?: number;
  floors?: Floor[];
  vastuScore?: number;
  vastuResult?: VastuResult;
  nbcResult?: NbcResult;
  energyResult?: EnergyResult;
  sunlightResult?: SunlightResult;
  bomResult?: BomResult;
}

export interface ProjectMeta {
  name?: string;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  entry_dir?: string;
  length?: number;
  width?: number;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Wraps fetch with an AbortController timeout to prevent infinite hangs.
// AI generation calls can be slow; 120s for those, 30s for data calls.
const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. The server may be overloaded.`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
};


const authFetch = async (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 30_000) => {
  const res = await fetchWithTimeout(input, init, timeoutMs);
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
  return res;
};

export const register = async (data: RegisterPayload) => {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const login = async (data: LoginPayload) => {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const fetchMe = async () => {
  const res = await authFetch(`${API_BASE_URL}/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
};

// ── Projects ─────────────────────────────────────────────────────────────────
export const getProjects = async () => {
  const res = await authFetch(`${API_BASE_URL}/projects`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
};

export const getProjectById = async (id: string) => {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
};

export const saveProject = async (data: SaveProjectPayload) => {
  const res = await authFetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save project");
  return res.json();
};

export const updateProject = async (id: string, data: SaveProjectPayload) => {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
};

export const deleteProject = async (id: string) => {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
};

// ── Generation ───────────────────────────────────────────────────────────────
export const generatePlans = async (data: GeneratePlansPayload): Promise<{ candidates: LayoutData[] }> => {
  const res = await authFetch(`${API_BASE_URL}/generate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }, 120_000);  // AI generation can take up to 2 min
  if (!res.ok) throw new Error(`Generation failed: ${await res.text()}`);
  return res.json();
};

export const exportDxf = async (rooms: Room[], planId: string, plotWidth: number, plotHeight: number): Promise<void> => {
  const res = await authFetch(`${API_BASE_URL}/export/dxf`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ rooms, plan_id: planId, plot_width: plotWidth, plot_height: plotHeight }),
  });
  if (!res.ok) throw new Error(`DXF export failed: ${await res.text()}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `floorplan_${planId}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const regenerateRoom = async (
  rooms: Room[],
  roomName: string,
  instruction: string,
  plotContext: {
    plotWidth: number;
    plotHeight: number;
    entryDir: string;
    bedrooms: number;
    bathrooms: number;
    floors: number;
  }
): Promise<LayoutUpdatePayload> => {
  const res = await authFetch(`${API_BASE_URL}/regenerate-room`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      rooms,
      room_name: roomName,
      instruction,
      plot_width: plotContext.plotWidth,
      plot_height: plotContext.plotHeight,
      entry_dir: plotContext.entryDir,
      bedrooms: plotContext.bedrooms,
      bathrooms: plotContext.bathrooms,
      floors: plotContext.floors,
    }),
  }, 120_000);  // AI regeneration can be slow
  if (!res.ok) throw new Error(`AI editing failed: ${await res.text()}`);
  return res.json();
};

export const vastuFix = async (
  layout: LayoutData,
  vastuResult: VastuResult | undefined,
  plotContext: {
    plotWidth: number;
    plotHeight: number;
    entryDir: string;
    bedrooms: number;
    bathrooms: number;
    floors: number;
  }
): Promise<VastuFixResult> => {
  const res = await authFetch(`${API_BASE_URL}/vastu/fix`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      layout,
      vastu_result: vastuResult ?? {},
      plot_width: plotContext.plotWidth,
      plot_height: plotContext.plotHeight,
      entry_dir: plotContext.entryDir,
      bedrooms: plotContext.bedrooms,
      bathrooms: plotContext.bathrooms,
      floors: plotContext.floors,
    }),
  }, 120_000);  // LLM topology fix can be slow
  if (!res.ok) throw new Error(`Vastu fix failed: ${await res.text()}`);
  return res.json();
};

export const nbcFix = async (
  layout: LayoutData,
  nbcResult: NbcResult | undefined,
  plotContext: {
    plotWidth: number;
    plotHeight: number;
    entryDir: string;
    bedrooms: number;
    bathrooms: number;
    floors: number;
  }
): Promise<NbcFixResult> => {
  const res = await authFetch(`${API_BASE_URL}/nbc/fix`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      layout,
      nbc_result: nbcResult ?? {},
      plot_width: plotContext.plotWidth,
      plot_height: plotContext.plotHeight,
      entry_dir: plotContext.entryDir,
      bedrooms: plotContext.bedrooms,
      bathrooms: plotContext.bathrooms,
      floors: plotContext.floors,
    }),
  }, 120_000);  // LLM topology fix can be slow
  if (!res.ok) throw new Error(`NBC fix failed: ${await res.text()}`);
  return res.json();
};

export const exportReport = async (
  layout: LayoutData,
  vastuResult: VastuResult | undefined,
  planId: string,
  projectMeta: ProjectMeta
): Promise<void> => {
  const res = await authFetch(`${API_BASE_URL}/export/pdf`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      layout,
      vastu_result: vastuResult ?? { score: 0, grade: "N/A", rules: [] },
      plan_id: planId,
      project_meta: projectMeta,
    }),
  });
  if (!res.ok) throw new Error(`Report export failed: ${await res.text()}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `report_${planId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const recalculateBOM = async (
  layout: LayoutData,
  sqft: number,
  tier: string
): Promise<{ status: string; bomResult: BomResult }> => {
  const res = await authFetch(`${API_BASE_URL}/bom/recalculate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      layout,
      sqft,
      tier,
    }),
  });
  if (!res.ok) throw new Error(`BOM recalculation failed: ${await res.text()}`);
  return res.json();
};
