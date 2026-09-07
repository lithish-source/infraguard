import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/leaflet.markercluster';
import { SEVERITY_COLORS } from '../utils/helpers';

// Fix default marker icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function createSeverityIcon(severity) {
  const color = SEVERITY_COLORS[severity]?.hex || '#6b7280';
  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="
        width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
        background: ${color}; transform: rotate(-45deg);
        border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
      ">
        <div style="
          width: 10px; height: 10px; border-radius: 50%;
          background: #fff; transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

/**
 * DamageMap — Leaflet map showing reports as clustered markers + optional heatmap.
 *
 * Props:
 *   reports: array of report objects with {id, latitude, longitude, title, ...}
 *   heatmap: array of [lat, lng, weight]
 *   center: [lat, lng]
 *   zoom: number
 *   onMarkerClick: (report) => void
 *   showHeatmap: boolean
 *   height: string (CSS height)
 */
export default function DamageMap({
  reports = [],
  heatmap = [],
  center = [20.5937, 78.9629],
  zoom = 5,
  flyTo = null,
  onMarkerClick,
  showHeatmap = false,
  height = '500px',
}) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const heatLayerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      scrollWheelZoom: true,
      preferCanvas: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);

    markerLayerRef.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    mapRef.current.addLayer(markerLayerRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle flying/zooming to state/district or center changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (flyTo) {
      if (flyTo.bounds && flyTo.bounds.length === 2) {
        if (typeof mapRef.current.flyToBounds === 'function') {
          mapRef.current.flyToBounds(flyTo.bounds, { maxZoom: 13, duration: 1.2 });
        } else {
          mapRef.current.fitBounds(flyTo.bounds, { maxZoom: 13 });
        }
      } else if (flyTo.center) {
        mapRef.current.flyTo(flyTo.center, flyTo.zoom || 11, { duration: 1.2 });
      }
    } else if (center) {
      mapRef.current.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [flyTo, center, zoom]);

  // Update markers when reports change
  useEffect(() => {
    if (!markerLayerRef.current) return;
    markerLayerRef.current.clearLayers();

    reports.forEach((r) => {
      if (!r.latitude || !r.longitude) return;
      const severity = r.final_severity || r.ai_severity || r.severity;
      const marker = L.marker([r.latitude, r.longitude], {
        icon: createSeverityIcon(severity),
      });

      const severityColor = SEVERITY_COLORS[severity]?.hex || '#6b7280';
      const imageUrl = r.image_url || r.properties?.image_url;
      const priorityScore = r.priority_score || r.properties?.priority_score;

      marker.bindPopup(`
        <div style="min-width: 220px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${r.title || r.properties?.title || 'Report'}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
            <span style="background: ${severityColor}; color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 11px;">${severity || 'Unknown'}</span>
            <span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 999px; font-size: 11px;">${r.status || r.properties?.status || ''}</span>
          </div>
          ${imageUrl ? `<img src="${imageUrl}" style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" />` : ''}
          <div style="font-size: 11px; color: #64748b;">
            ${r.category_name || r.properties?.category || ''} · ${r.verification_count || r.properties?.verification_count || 0} verifications
          </div>
          ${priorityScore ? `<div style="margin-top: 4px; font-size: 11px;"><b>Priority:</b> ${priorityScore.toFixed(1)}</div>` : ''}
          <a href="/reports/${r.id || r.properties?.id}" style="display: inline-block; margin-top: 6px; color: #1f44f5; font-size: 12px; text-decoration: none;">View details →</a>
        </div>
      `);

      marker.on('click', () => {
        if (onMarkerClick) onMarkerClick(r);
      });

      markerLayerRef.current.addLayer(marker);
    });
  }, [reports, onMarkerClick]);

  // Heatmap
  useEffect(() => {
    if (!mapRef.current) return;
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    if (showHeatmap && heatmap.length > 0 && L.heatLayer) {
      heatLayerRef.current = L.heatLayer(heatmap, {
        radius: 35,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        gradient: { 0.2: '#22c55e', 0.4: '#f59e0b', 0.7: '#ef4444', 1.0: '#7c3aed' },
      }).addTo(mapRef.current);
    }
  }, [heatmap, showHeatmap]);

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
}
