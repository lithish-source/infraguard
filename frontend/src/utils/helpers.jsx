// Shared utility functions

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date, opts = {}) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

export function timeAgo(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export const SEVERITY_COLORS = {
  Low: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300', hex: '#22c55e', badge: 'badge-low' },
  Moderate: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', hex: '#f59e0b', badge: 'badge-moderate' },
  High: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-800 dark:text-red-300', hex: '#ef4444', badge: 'badge-high' },
  Critical: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-800 dark:text-purple-300', hex: '#7c3aed', badge: 'badge-critical' },
};

export const STATUS_COLORS = {
  Reported: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Verified: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Assigned: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'In Progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Resolved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function severityBadge(severity) {
  if (!severity) return <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Unassessed</span>;
  const cls = SEVERITY_COLORS[severity]?.badge || 'badge bg-slate-100 text-slate-600';
  return <span className={cls}>{severity}</span>;
}

export function statusBadge(status) {
  if (!status) return null;
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-700';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  if (typeof n !== 'number') return String(n);
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function priorityColor(score) {
  if (score === null || score === undefined) return 'text-slate-500';
  if (score >= 80) return 'text-purple-600 dark:text-purple-400';
  if (score >= 60) return 'text-red-600 dark:text-red-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  if (score >= 20) return 'text-blue-600 dark:text-blue-400';
  return 'text-slate-500';
}

export function getCategoryFallbackImage(categoryName = '', damageType = '') {
  const cat = `${categoryName || ''} ${damageType || ''}`.toLowerCase();
  if (cat.includes('water') || cat.includes('flood') || cat.includes('pipe') || cat.includes('drain')) {
    return 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800&auto=format&fit=crop&q=80';
  }
  if (cat.includes('bridge') || cat.includes('flyover')) {
    return 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800&auto=format&fit=crop&q=80';
  }
  if (cat.includes('electric') || cat.includes('power') || cat.includes('light') || cat.includes('wire')) {
    return 'https://images.unsplash.com/photo-1509390144018-eeaf65052242?w=800&auto=format&fit=crop&q=80';
  }
  if (cat.includes('building') || cat.includes('wall') || cat.includes('structure') || cat.includes('crack')) {
    return 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&auto=format&fit=crop&q=80';
  }
  // Default Road / Pothole damage
  return 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80';
}
