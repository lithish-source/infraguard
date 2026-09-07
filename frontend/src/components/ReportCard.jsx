import {
  severityBadge, statusBadge, timeAgo, priorityColor, SEVERITY_COLORS,
  getCategoryFallbackImage,
} from '../utils/helpers';
import { Link } from 'react-router-dom';

export default function ReportCard({ report }) {
  const severity = report.final_severity || report.ai_severity;
  const priorityScore = report.priority_score;
  const fallbackImg = getCategoryFallbackImage(report.category_name, report.ai_damage_type);

  return (
    <Link
      to={`/reports/${report.id}`}
      className="card p-4 flex gap-4 hover:shadow-card-hover transition-shadow group"
    >
      {/* Thumbnail */}
      <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
        <img
          src={report.image_url || fallbackImg}
          alt={report.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = fallbackImg;
          }}
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 mb-0.5">{report.reference_code}</div>
            <h3 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">
              {report.title}
            </h3>
          </div>
          {priorityScore !== null && priorityScore !== undefined && (
            <div className="text-right flex-shrink-0">
              <div className={`text-lg font-bold ${priorityColor(priorityScore)}`}>
                {priorityScore.toFixed(0)}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Priority</div>
            </div>
          )}
        </div>

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

        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          <span>✓ {report.verification_count} verifications</span>
          <span>·</span>
          <span>{timeAgo(report.created_at)}</span>
          {report.priority_rank && (
            <>
              <span>·</span>
              <span>Rank #{report.priority_rank}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
