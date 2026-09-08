import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout.jsx';
import Loading from '../components/Loading.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import { PriorityRadar } from '../components/Charts.jsx';
import DamageMap from '../components/DamageMap.jsx';
import { reportService, adminService } from '../services';
import { useAuth } from '../context/AuthContext';
import {
  severityBadge, statusBadge, formatDate, timeAgo, priorityColor, SEVERITY_COLORS,
  getCategoryFallbackImage,
} from '../utils/helpers';

export default function ReportDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  // Verification form
  const [verifForm, setVerifForm] = useState({
    severity_vote: '', comment: '', is_confirmed: true,
  });
  const [verifImage, setVerifImage] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const handleAdminProgress = async () => {
    setAdminActionLoading(true);
    try {
      const res = await adminService.updateStatus(id, {
        status: 'In Progress',
        notes: 'Repair team is currently working on site.',
      });
      setReport((prev) => ({ ...prev, status: 'In Progress' }));
      toast.success('Status updated to "In Progress".');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Update failed.');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleAdminResolveAndDelete = async () => {
    const confirm = window.confirm(
      `Mark work as completed for report "${report?.reference_code}"? This will resolve and remove the report from active maps and lists.`
    );
    if (!confirm) return;

    setAdminActionLoading(true);
    try {
      await adminService.updateStatus(id, {
        status: 'Resolved',
        notes: 'Work completed successfully on site.',
        delete_on_resolved: true,
      });
      toast.success('Work is done! Report resolved and removed.');
      navigate('/admin/reports');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resolve and remove.');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [customTeam, setCustomTeam] = useState('');

  const handleAssignTeam = async (teamName) => {
    const finalTeam = teamName || customTeam.trim() || 'Team Alpha';
    setAdminActionLoading(true);
    try {
      const updated = await adminService.assignTeam(id, {
        team: finalTeam,
        notes: 'Assigned via Administrator Work Controls',
      });
      setReport((prev) => ({
        ...prev,
        assigned_team: finalTeam,
        status: updated.status || 'Assigned',
      }));
      setAssignModalOpen(false);
      setCustomTeam('');
      toast.success(`Report assigned to "${finalTeam}".`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Assignment failed.');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const fetchReport = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const data = await reportService.get(id);
      setReport(data);
      setError(null);
    } catch (err) {
      if (!isBackground) setError(err.response?.data?.detail || 'Report not found.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-refresh when AI analysis is still pending
  useEffect(() => {
    if (report && (!report.ai_severity || report.ai_severity === 'Unassessed')) {
      const timer = setTimeout(() => {
        fetchReport(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [report, id]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const fd = new FormData();
      fd.append('severity_vote', verifForm.severity_vote || '');
      fd.append('comment', verifForm.comment || '');
      fd.append('is_confirmed', verifForm.is_confirmed);
      if (verifImage) fd.append('image', verifImage);

      const updated = await reportService.verify(id, fd);
      setReport(updated);
      toast.success('Verification submitted. Thank you!');
      setVerifForm({ severity_vote: '', comment: '', is_confirmed: true });
      setVerifImage(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) return <Layout><Loading size="lg" label="Loading report..." /></Layout>;
  if (error) return <Layout><ErrorState message={error} onRetry={() => navigate('/map')} /></Layout>;
  if (!report) return null;

  const severity = report.final_severity || report.ai_severity;
  const isOwner = user?.id === report.user_id;
  const alreadyVerified = report.verifications?.some((v) => v.user_id === user?.id);

  const priorityComponents = report.priority ? {
    severity: report.priority.severity_component,
    verification: report.priority.verification_component,
    population: report.priority.population_component,
    'road_importance': report.priority.road_importance_component,
    'hospital_proximity': report.priority.hospital_proximity_component,
    'school_proximity': report.priority.school_proximity_component,
    'utility_importance': report.priority.utility_importance_component,
    'time_urgency': report.priority.time_urgency_component,
    'verification_status': report.priority.verification_status_component,
  } : null;

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <Link to="/map" className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to map
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-slate-500 mb-1">{report.reference_code}</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{report.title}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              {severityBadge(severity)}
              {statusBadge(report.status)}
              {report.category_name && (
                <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {report.category_name}
                </span>
              )}
              {report.district_name && (
                <span className="badge bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  📍 {report.district_name}
                </span>
              )}
            </div>
          </div>
          {report.priority && (
            <div className="text-right">
              <div className={`text-4xl font-bold ${priorityColor(report.priority.score)}`}>
                {report.priority.score.toFixed(0)}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Priority Score</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                {report.priority.resource_urgency} urgency
              </div>
              <div className="text-xs text-slate-500">
                Respond {report.priority.recommended_response_time}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Quick Control Banner */}
      {isAdmin && (
        <div className="card p-4 mb-6 bg-slate-900 text-white border-brand-500/40 shadow-md">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👮</span>
              <div>
                <div className="font-semibold text-sm">Administrator Work Controls</div>
                <div className="text-xs text-slate-400">
                  Assign response team, update progress to In Progress, or mark Work Done to resolve &amp; delete.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={adminActionLoading}
                onClick={() => setAssignModalOpen((v) => !v)}
                className="btn bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-1.5 px-3 flex items-center gap-1.5 font-medium shadow-sm transition-all"
              >
                <span>👷</span>
                <span>{report.assigned_team ? `Team: ${report.assigned_team}` : 'Assign Team'}</span>
                <span className="text-[10px] ml-0.5">{assignModalOpen ? '▲' : '▼'}</span>
              </button>
              <button
                type="button"
                disabled={adminActionLoading || report.status === 'In Progress'}
                onClick={handleAdminProgress}
                className="btn bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
              >
                <span>🟡</span>
                <span>{report.status === 'In Progress' ? 'In Progress' : 'Mark In Progress'}</span>
              </button>
              <button
                type="button"
                disabled={adminActionLoading}
                onClick={handleAdminResolveAndDelete}
                className="btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold shadow-sm"
              >
                <span>✅</span>
                <span>Work Done &amp; Delete</span>
              </button>
              <Link
                to="/admin/reports"
                className="btn-ghost text-xs text-slate-300 hover:text-white"
              >
                Admin Portal →
              </Link>
            </div>
          </div>

          {/* Expandable Assign Team Drawer */}
          {assignModalOpen && (
            <div className="mt-3 pt-3 border-t border-slate-700/80 flex flex-wrap items-center gap-2 animate-fade-in">
              <span className="text-xs text-slate-300 font-medium">Quick Assign:</span>
              {['Team Alpha', 'Team Bravo', 'Team Charlie', 'Team Delta'].map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={adminActionLoading}
                  onClick={() => handleAssignTeam(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    report.assigned_team === t
                      ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                      : 'bg-slate-800 text-slate-200 border-slate-700 hover:border-blue-400 hover:bg-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  placeholder="Custom team name..."
                  value={customTeam}
                  onChange={(e) => setCustomTeam(e.target.value)}
                  className="input text-xs py-1 px-2.5 w-44 bg-slate-800 border-slate-700 text-white placeholder-slate-400"
                />
                <button
                  type="button"
                  disabled={adminActionLoading || !customTeam.trim()}
                  onClick={() => handleAssignTeam(customTeam.trim())}
                  className="btn bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-1 px-3"
                >
                  Assign
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: images + description + map */}
        <div className="lg:col-span-2 space-y-6">
          {/* Images */}
          {report.images?.length > 0 ? (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Photos ({report.images.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {report.images.map((img) => (
                  <a
                    key={img.id}
                    href={img.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 group relative"
                  >
                    <img
                      src={img.file_url}
                      alt={img.caption || report.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = getCategoryFallbackImage(report.category_name, report.ai_damage_type);
                      }}
                    />
                    {img.is_primary && (
                      <span className="absolute top-1 left-1 bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">Incident Photo</h3>
                <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded">
                  Demo Reference Photo
                </span>
              </div>
              <div className="rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 max-h-96">
                <img
                  src={getCategoryFallbackImage(report.category_name, report.ai_damage_type)}
                  alt={report.title}
                  className="w-full h-64 sm:h-80 object-cover"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Description</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {report.description}
            </p>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs text-slate-500">
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Address</div>
                <div>{report.address || '—'}</div>
              </div>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Coordinates</div>
                <div>{report.latitude?.toFixed(4)}, {report.longitude?.toFixed(4)}</div>
              </div>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Reported By</div>
                <div>{report.user_name || 'Anonymous'}</div>
              </div>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Reported On</div>
                <div>{formatDate(report.created_at)}</div>
              </div>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Assigned Team</div>
                <div className="flex items-center gap-2">
                  <span className={report.assigned_team ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400 italic'}>
                    {report.assigned_team || 'Unassigned'}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setAssignModalOpen(true)}
                      className="text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 underline font-medium cursor-pointer"
                    >
                      {report.assigned_team ? 'Change' : 'Assign'}
                    </button>
                  )}
                </div>
              </div>
              {report.resolved_at && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-300">Resolved On</div>
                  <div>{formatDate(report.resolved_at)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Location</h3>
            <DamageMap
              reports={[report]}
              center={[report.latitude, report.longitude]}
              zoom={15}
              height="300px"
            />
          </div>

          {/* Verifications list */}
          {report.verifications?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
                Crowd Verifications ({report.verifications.length})
              </h3>
              <div className="space-y-3">
                {report.verifications.map((v) => (
                  <div key={v.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3 py-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{v.is_confirmed ? '✓ Confirmed' : '✗ Flagged'}</span>
                      {v.severity_vote && (
                        <span className={SEVERITY_COLORS[v.severity_vote]?.badge}>{v.severity_vote}</span>
                      )}
                      <span>· {timeAgo(v.created_at)}</span>
                    </div>
                    {v.comment && (
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{v.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: AI + priority + verify form */}
        <div className="space-y-6">
          {/* AI Analysis */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              🤖 AI Analysis
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Detected Severity</span>
                <div>{severityBadge(report.ai_severity)}</div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Damage Type</span>
                <span className="font-medium text-slate-900 dark:text-white">{report.ai_damage_type || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Confidence</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {report.ai_confidence ? `${(report.ai_confidence * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              {report.final_severity && report.final_severity !== report.ai_severity && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Admin Override</span>
                  <div>{severityBadge(report.final_severity)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Priority breakdown */}
          {report.priority && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Priority Breakdown</h3>
              <p className="text-xs text-slate-500 mb-3">Severity-based scoring with context boosters</p>
              <div className="space-y-1.5 text-xs">
                {/* Base score from severity */}
                <div className="flex items-center gap-2">
                  <span className="w-32 text-slate-500 truncate font-medium">Base Score</span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full"
                      style={{ width: `${Math.min(100, report.priority.severity_component * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-slate-700 dark:text-slate-300 font-mono">
                    {(report.priority.severity_component * 100).toFixed(0)}
                  </span>
                </div>
                {/* Boosters */}
                <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Context Boosters</span>
                </div>
                {[
                  ['Hospital Proximity', report.priority.hospital_proximity_component, 15],
                  ['School Proximity', report.priority.school_proximity_component, 10],
                  ['Population Impact', report.priority.population_component, 10],
                  ['Road Importance', report.priority.road_importance_component, 10],
                  ['Utility Importance', report.priority.utility_importance_component, 8],
                  ['Confirmations', report.priority.verification_component, 10],
                  ['Report Age', report.priority.time_urgency_component, 5],
                  ['Credibility', report.priority.verification_status_component, 5],
                ].map(([label, val, maxPts]) => {
                  const pts = ((val || 0) * maxPts).toFixed(1);
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-32 text-slate-500 truncate">{label}</span>
                      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, (val || 0) * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        +{pts} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nearby Critical Facilities */}
          {report.nearby_facilities && report.nearby_facilities.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                📍 Nearby Critical Facilities
              </h3>
              <p className="text-xs text-slate-500 mb-3">Live proximity from OpenStreetMap</p>
              <div className="space-y-2">
                {report.nearby_facilities.map((fac, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs">
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-base p-1 rounded-md bg-white dark:bg-slate-700 shadow-xs">
                        {fac.type === 'Hospital' ? '🏥' : '🏫'}
                      </span>
                      <div className="truncate">
                        <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{fac.name}</p>
                        <p className="text-[10px] text-slate-400">{fac.type}</p>
                      </div>
                    </div>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 ml-2 text-xs bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                      {fac.distance_km < 1 ? `${Math.round(fac.distance_km * 1000)}m` : `${fac.distance_km.toFixed(2)}km`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Crowd validation form */}
          {!isOwner && !alreadyVerified && report.status !== 'Resolved' && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Verify This Report</h3>
              <p className="text-xs text-slate-500 mb-3">
                Help build community consensus. Your vote increases report credibility.
              </p>
              <form onSubmit={handleVerify} className="space-y-3">
                <div>
                  <label className="label text-xs">Your Severity Vote (optional)</label>
                  <select
                    className="input text-sm"
                    value={verifForm.severity_vote}
                    onChange={(e) => setVerifForm({ ...verifForm, severity_vote: e.target.value })}
                  >
                    <option value="">No vote</option>
                    <option value="Low">Low</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Comment (optional)</label>
                  <textarea
                    className="input text-sm"
                    rows="2"
                    placeholder="Add context..."
                    value={verifForm.comment}
                    onChange={(e) => setVerifForm({ ...verifForm, comment: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label text-xs">Additional photo (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="input text-sm py-1.5"
                    onChange={(e) => setVerifImage(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVerifForm({ ...verifForm, is_confirmed: false })}
                    className={`btn-secondary flex-1 text-sm ${!verifForm.is_confirmed ? 'ring-2 ring-red-400' : ''}`}
                  >
                    ✗ Flag
                  </button>
                  <button
                    type="submit"
                    disabled={verifying}
                    className="btn-primary flex-1 text-sm"
                  >
                    {verifying ? '...' : '✓ Confirm'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {alreadyVerified && (
            <div className="card p-5 text-center text-sm text-slate-500">
              ✓ You have already verified this report. Thank you!
            </div>
          )}

          {isOwner && (
            <div className="card p-5 text-center text-sm text-slate-500">
              This is your report — others can verify it.
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
