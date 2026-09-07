import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout.jsx';
import DamageMap from '../components/DamageMap.jsx';
import Loading from '../components/Loading.jsx';
import { reportService, referenceService } from '../services';

const SEVERITIES = ['Low', 'Moderate', 'High', 'Critical'];
const STATUSES = ['Reported', 'Verified', 'Assigned', 'In Progress', 'Resolved'];

import { ALL_INDIAN_STATES, STATE_CENTERS, getDistrictCoordinates } from '../data/indianDistricts.js';

export default function MapView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [infraTypes, setInfraTypes] = useState([]);
  const [states, setStates] = useState(ALL_INDIAN_STATES);
  const [selectedState, setSelectedState] = useState('');
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mapFlyTo, setMapFlyTo] = useState(null);

  const filters = {
    district_id: searchParams.get('district') || '',
    category_id: searchParams.get('category') || '',
    severity: searchParams.get('severity') || '',
    status: searchParams.get('status') || '',
  };

  useEffect(() => {
    (async () => {
      try {
        const [types, dist, fetchedStates] = await Promise.all([
          referenceService.infrastructureTypes(),
          referenceService.districts(),
          referenceService.states().catch(() => ALL_INDIAN_STATES),
        ]);
        setInfraTypes(types);
        setDistricts(dist);
        if (fetchedStates && fetchedStates.length > 0) {
          setStates(fetchedStates);
        }
        const initialDistId = searchParams.get('district');
        if (initialDistId && dist) {
          const match = dist.find((d) => String(d.id) === String(initialDistId));
          if (match) {
            if (match.state) setSelectedState(match.state);
            getDistrictCoordinates(match.name, match.state).then((coords) => {
              if (coords) {
                setMapFlyTo({ ...coords, _t: Date.now() });
              } else if (match.state && STATE_CENTERS[match.state]) {
                setMapFlyTo({ ...STATE_CENTERS[match.state], _t: Date.now() });
              }
            });
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const fetchMapData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.district_id) params.district_id = filters.district_id;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.severity) params.severity = filters.severity;
      if (filters.status) params.status = filters.status;

      const [geojson, heat] = await Promise.all([
        reportService.getMapData(params),
        reportService.getHeatmap({ severity: filters.severity }),
      ]);
      // Convert GeoJSON to flat report list
      const flat = (geojson.features || []).map((f) => ({
        id: f.properties.id,
        title: f.properties.title,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        ai_severity: f.properties.severity,
        final_severity: f.properties.severity,
        severity: f.properties.severity,
        status: f.properties.status,
        category_name: f.properties.category,
        verification_count: f.properties.verification_count,
        priority_score: f.properties.priority_score,
        priority_rank: f.properties.priority_rank,
        image_url: f.properties.image_url,
      }));
      setReports(flat);
      setHeatmapPoints(heat.points || []);
    } catch (err) {
      toast.error('Could not load map data.');
    } finally {
      setLoading(false);
    }
  }, [filters.district_id, filters.category_id, filters.severity, filters.status]);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const handleStateChange = (newState) => {
    setSelectedState(newState);
    updateFilter('district', '');
    if (newState && STATE_CENTERS[newState]) {
      setMapFlyTo({ ...STATE_CENTERS[newState], _t: Date.now() });
    } else if (!newState) {
      setMapFlyTo({ center: [22.3511, 78.6677], zoom: 5, _t: Date.now() });
    }
  };

  const handleDistrictChange = async (districtId) => {
    updateFilter('district', districtId);
    if (!districtId) {
      if (selectedState && STATE_CENTERS[selectedState]) {
        setMapFlyTo({ ...STATE_CENTERS[selectedState], _t: Date.now() });
      }
      return;
    }
    const match = districts.find((d) => String(d.id) === String(districtId));
    if (match) {
      const coords = await getDistrictCoordinates(match.name, match.state || selectedState);
      if (coords) {
        setMapFlyTo({ ...coords, _t: Date.now() });
      } else if (selectedState && STATE_CENTERS[selectedState]) {
        setMapFlyTo({ ...STATE_CENTERS[selectedState], _t: Date.now() });
      }
    }
  };

  const clearFilters = () => {
    setSelectedState('');
    setSearchParams({});
    setMapFlyTo({ center: [22.3511, 78.6677], zoom: 5, _t: Date.now() });
  };

  const summary = useMemo(() => ({
    total: reports.length,
    critical: reports.filter((r) => r.severity === 'Critical').length,
    high: reports.filter((r) => r.severity === 'High').length,
    resolved: reports.filter((r) => r.status === 'Resolved').length,
  }), [reports]);

  const availableDistricts = selectedState
    ? districts.filter((d) => d.state === selectedState)
    : [];

  return (
    <Layout>
      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label text-xs font-semibold">1. State / UT</label>
            <select
              className="input text-sm py-1.5 min-w-[150px]"
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
            >
              <option value="">All States</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs font-semibold">2. District</label>
            <select
              className={`input text-sm py-1.5 min-w-[160px] ${!selectedState ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={filters.district_id}
              onChange={(e) => handleDistrictChange(e.target.value)}
              disabled={!selectedState}
            >
              <option value="">
                {selectedState ? `All Districts in ${selectedState}` : '← Select State first'}
              </option>
              {availableDistricts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Category</label>
            <select
              className="input text-sm py-1.5 min-w-[160px]"
              value={filters.category_id}
              onChange={(e) => updateFilter('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {infraTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Severity</label>
            <select
              className="input text-sm py-1.5 min-w-[140px]"
              value={filters.severity}
              onChange={(e) => updateFilter('severity', e.target.value)}
            >
              <option value="">All Severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Status</label>
            <select
              className="input text-sm py-1.5 min-w-[140px]"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="rounded"
            />
            🔥 Heatmap
          </label>
          <button onClick={clearFilters} className="btn-ghost text-sm">Clear</button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{summary.total}</div>
          <div className="text-xs text-slate-500">Reports Shown</div>
        </div>
        <div className="card p-3 text-center border-purple-200 dark:border-purple-900/40">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{summary.critical}</div>
          <div className="text-xs text-slate-500">Critical</div>
        </div>
        <div className="card p-3 text-center border-red-200 dark:border-red-900/40">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.high}</div>
          <div className="text-xs text-slate-500">High Severity</div>
        </div>
        <div className="card p-3 text-center border-green-200 dark:border-green-900/40">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.resolved}</div>
          <div className="text-xs text-slate-500">Resolved</div>
        </div>
      </div>

      {/* Map */}
      <div className="card p-2 mb-4 relative">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur flex items-center justify-center rounded-xl">
            <Loading size="md" label="Loading map data..." />
          </div>
        )}
        <DamageMap
          reports={reports}
          heatmap={heatmapPoints}
          showHeatmap={showHeatmap}
          height="600px"
          center={[22.3511, 78.6677]}
          zoom={5}
          flyTo={mapFlyTo}
        />
      </div>

      {/* Legend */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Severity Legend:</span>
          {[
            ['Low', '#22c55e'],
            ['Moderate', '#f59e0b'],
            ['High', '#ef4444'],
            ['Critical', '#7c3aed'],
          ].map(([label, color]) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ background: color }} />
              <span className="text-slate-600 dark:text-slate-400">{label}</span>
            </div>
          ))}
          <span className="ml-auto text-slate-500">Click markers for details · Clustered for clarity</span>
        </div>
      </div>
    </Layout>
  );
}
