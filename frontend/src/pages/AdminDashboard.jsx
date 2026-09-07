import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout.jsx';
import StatCard from '../components/StatCard.jsx';
import ReportCard from '../components/ReportCard.jsx';
import Loading from '../components/Loading.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import {
  SeverityDoughnut, CategoryBar, MonthlyTrendLine, DistrictAnalyticsBar,
} from '../components/Charts.jsx';
import {
  adminService, reportService,
} from '../services';
import { severityBadge, statusBadge } from '../utils/helpers';

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [severity, setSeverity] = useState([]);
  const [category, setCategory] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [activeReports, setActiveReports] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, sev, cat, mon, dist, repList] = await Promise.all([
          adminService.dashboardSummary(),
          adminService.severityDist(),
          adminService.categoryDist(),
          adminService.monthlyTrend(6),
          adminService.districtAnalytics(),
          reportService.list({ page: 1, page_size: 10, order_by: 'priority_desc' }),
        ]);
        setSummary(s);
        setSeverity(sev);
        setCategory(cat);
        setMonthly(mon);
        setDistricts(dist);
        setActiveReports(repList.items || []);
      } catch (err) {
        setError(err.response?.data?.detail || 'Could not load admin dashboard.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleQuickProgress = async (reportId) => {
    setUpdatingId(reportId);
    try {
      const res = await adminService.updateStatus(reportId, {
        status: 'In Progress',
        notes: 'Repair team is currently working on site.',
      });
      setActiveReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'In Progress' } : r))
      );
      toast.success('Report marked as "In Progress".');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Update failed.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleQuickResolveAndDelete = async (reportId, refCode) => {
    setUpdatingId(reportId);
    try {
      await adminService.updateStatus(reportId, {
        status: 'Resolved',
        notes: 'Work completed successfully on site.',
        delete_on_resolved: true,
      });
      setActiveReports((prev) => prev.filter((r) => r.id !== reportId));
      if (summary) {
        setSummary((s) => ({ ...s, total_reports: Math.max(0, s.total_reports - 1) }));
      }
      toast.success(`Work is done! Report ${refCode} resolved and removed.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resolve and delete.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRecompute = async () => {
    try {
      const res = await adminService.recomputePriorities();
      toast.success(res.message);
    } catch {
      toast.error('Could not recompute priorities.');
    }
  };

  if (loading) return <Layout><Loading size="lg" label="Loading admin dashboard..." /></Layout>;
  if (error) return <Layout><ErrorState message={error} onRetry={() => window.location.reload()} /></Layout>;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h2>
          <p className="text-sm text-slate-500">System-wide overview of infrastructure damage reports and response.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRecompute} className="btn-secondary text-sm">
            🔄 Recompute Priorities
          </button>
          <Link to="/admin/reports" className="btn-primary text-sm">
            Manage Reports →
          </Link>
        </div>
      </div>

      {/* Critical alert banner */}
      {summary?.critical_incidents > 0 && (
        <div className="card p-4 mb-6 bg-gradient-to-r from-purple-600 to-red-600 text-white border-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <div className="font-semibold">{summary.critical_incidents} critical incidents need attention</div>
              <div className="text-sm text-purple-100">Immediate response recommended within 2 hours.</div>
            </div>
          </div>
          <Link to="/admin/reports?severity=Critical" className="btn bg-white text-purple-700 hover:bg-purple-50 text-sm">
            View Critical →
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Reports" value={summary.total_reports} icon="📝" color="brand" />
        <StatCard title="Pending" value={summary.pending_reports} icon="⏳" color="amber" />
        <StatCard title="Verified" value={summary.verified_reports} icon="✓" color="blue" />
        <StatCard title="Resolved" value={summary.resolved_reports} icon="✅" color="green" />
        <StatCard title="Critical Incidents" value={summary.critical_incidents} icon="🚨" color="purple" />
        <StatCard title="Total Citizens" value={summary.total_users} icon="👥" color="slate" />
        <StatCard title="Verifications" value={summary.total_verifications} icon="🔍" color="blue" />
        <StatCard
          title="Avg Response Time"
          value={summary.avg_response_time_hours ? `${summary.avg_response_time_hours}h` : '—'}
          subtitle={`Response rate: ${summary.response_rate}%`}
          icon="⏱️"
          color="green"
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Severity Distribution</h3>
          <SeverityDoughnut data={severity} />
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Monthly Trend (6 months)</h3>
          <MonthlyTrendLine data={monthly} />
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Damage Categories</h3>
          <CategoryBar data={category} />
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">District Analytics</h3>
          <DistrictAnalyticsBar data={districts} />
        </div>
      </div>

      {/* Active reports with quick work updates */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              📋 Active Reports &amp; Quick Work Updates
            </h3>
            <p className="text-xs text-slate-500">
              Update status to In Progress or mark Work Done to automatically resolve &amp; remove.
            </p>
          </div>
          <Link to="/admin/reports" className="btn-secondary text-xs">
            Manage All Reports ({summary?.total_reports || 0}) →
          </Link>
        </div>

        {activeReports.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No active reports. All issues resolved! 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Report</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Quick Work Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {activeReports.map((r) => {
                  const isUpdating = updatingId === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{r.title}</div>
                        <div className="text-[11px] font-mono text-slate-400">{r.reference_code}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        {r.district_name || 'General Area'}
                      </td>
                      <td className="py-3 px-3">
                        {severityBadge(r.final_severity || r.ai_severity)}
                      </td>
                      <td className="py-3 px-3">
                        {statusBadge(r.status)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isUpdating || r.status === 'In Progress'}
                            onClick={() => handleQuickProgress(r.id)}
                            className="btn bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] py-1 px-2.5 rounded shadow-sm flex items-center gap-1"
                            title="Mark as In Progress"
                          >
                            <span>🟡</span>
                            <span>{r.status === 'In Progress' ? 'In Progress' : 'In Progress'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleQuickResolveAndDelete(r.id, r.reference_code)}
                            className="btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] py-1 px-2.5 rounded shadow-sm font-semibold flex items-center gap-1"
                            title="Mark Work Done & Resolve/Delete"
                          >
                            <span>✅</span>
                            <span>Work Done &amp; Delete</span>
                          </button>
                          <Link
                            to={`/reports/${r.id}`}
                            className="btn-ghost text-[11px] py-1 px-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
