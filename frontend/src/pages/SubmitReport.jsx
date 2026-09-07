import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout.jsx';
import Loading from '../components/Loading.jsx';
import { reportService, referenceService } from '../services';
import { useAuth } from '../context/AuthContext';
import { ALL_INDIAN_STATES, detectStateAndDistrict } from '../data/indianDistricts.js';

export default function SubmitReport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [infraTypes, setInfraTypes] = useState([]);
  const [states, setStates] = useState(ALL_INDIAN_STATES);
  const [selectedState, setSelectedState] = useState('');
  const [districts, setDistricts] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category_id: '',
    district_id: '',
    latitude: '',
    longitude: '',
    address: '',
  });
  const [images, setImages] = useState([]);
  const [errors, setErrors] = useState({});

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
      } catch {
        toast.error('Could not load reference data.');
      } finally {
        setLoadingRefs(false);
      }
    })();
  }, []);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setForm((f) => ({
          ...f,
          latitude: lat,
          longitude: lng,
        }));
        toast.success('GPS location captured.');

        // Auto-populate street address from Nominatim
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              setForm((f) => ({ ...f, address: data.display_name }));
              const detected = detectStateAndDistrict(data.display_name);
              if (detected.state) {
                setSelectedState(detected.state);
                if (detected.district) {
                  const match = districts.find(
                    (d) => d.state === detected.state && d.name.toLowerCase() === detected.district.toLowerCase()
                  );
                  if (match) {
                    setForm((f) => ({ ...f, district_id: String(match.id) }));
                    toast.success(`Location identified: ${match.name}, ${detected.state}`);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Reverse geocode error:', e);
        }

        setLocating(false);
      },
      (err) => {
        toast.error(`Could not get location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const compressImage = (file, maxWidth = 1280, maxHeight = 1280, quality = 0.85) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => resolve(file);
      };
      reader.onerror = () => resolve(file);
    });
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length !== files.length) {
      toast.error('Only image files are allowed.');
    }
    if (valid.length > 5) {
      toast.error('Max 5 images per report.');
      valid.splice(5);
    }
    
    // Auto-compress for instant upload
    const compressed = await Promise.all(valid.map((f) => compressImage(f)));
    setImages(compressed);
  };

  const validate = () => {
    const e = {};
    if (!form.title || form.title.length < 5) e.title = 'Title must be at least 5 characters';
    if (!form.description || form.description.length < 10) e.description = 'Description must be at least 10 characters';
    if (!form.category_id) e.category_id = 'Please select a category';
    if (!form.latitude || !form.longitude) e.location = 'Location is required — click "Detect My Location"';
    if (images.length === 0) e.images = 'At least one photo is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error('Please fix the errors before submitting.');
      return;
    }
    setSubmitting(true);

    const formData = new FormData();
    formData.append('title', form.title);
    formData.append('description', form.description);
    formData.append('category_id', form.category_id);
    formData.append('latitude', form.latitude);
    formData.append('longitude', form.longitude);
    if (form.address) formData.append('address', form.address);
    if (form.district_id) formData.append('district_id', form.district_id);
    images.forEach((img) => formData.append('images', img));

    try {
      const created = await reportService.create(formData);
      toast.success(`Report ${created.reference_code} submitted! AI severity: ${created.ai_severity || 'pending'}.`);
      navigate(`/reports/${created.id}`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Submission failed. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStateChange = (newState) => {
    setSelectedState(newState);
    const currentDist = districts.find((d) => String(d.id) === String(form.district_id));
    if (currentDist && currentDist.state !== newState) {
      setForm((f) => ({ ...f, district_id: '' }));
    }
  };

  // Only show districts once a state has been selected to eliminate unnecessary workload
  const availableDistricts = selectedState
    ? districts.filter((d) => d.state === selectedState)
    : [];

  if (loadingRefs) return <Layout><Loading size="lg" label="Loading form..." /></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Submit a Damage Report</h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload photos and details about damaged infrastructure. Our AI will analyze severity automatically.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="label">Report Title *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Large pothole on MG Road near signal"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={255}
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="label">Damage Category *</label>
            <select
              className="input"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Select category...</option>
              {infraTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
              ))}
            </select>
            {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id}</p>}
          </div>

          {/* Location: Guided State -> District Selection */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                📍 Location Selection
              </span>
              {selectedState && (
                <span className="text-xs bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-medium px-2 py-0.5 rounded-full">
                  {availableDistricts.length} districts in {selectedState}
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Step 1: State / UT
                </label>
                <select
                  className="input text-sm"
                  value={selectedState}
                  onChange={(e) => handleStateChange(e.target.value)}
                >
                  <option value="">-- Select State / UT first --</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Step 2: District {selectedState ? `(${selectedState})` : ''}
                </label>
                <select
                  className={`input text-sm ${!selectedState ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-900' : ''}`}
                  value={form.district_id}
                  onChange={(e) => setForm({ ...form, district_id: e.target.value })}
                  disabled={!selectedState}
                >
                  <option value="">
                    {selectedState
                      ? `-- Select ${selectedState} District --`
                      : '← Please select a State first'}
                  </option>
                  {availableDistricts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {!selectedState && (
                  <p className="text-xs text-slate-400 mt-1">
                    Select your State in Step 1 to see its districts here.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description *</label>
            <textarea
              className="input min-h-[100px]"
              placeholder="Describe what you observed, when, and any safety concerns..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={5000}
            />
            <div className="flex justify-between mt-1">
              {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
              <p className="text-xs text-slate-400 ml-auto">{form.description.length}/5000</p>
            </div>
          </div>

          {/* Location */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">Location *</label>
              <button
                type="button"
                onClick={detectLocation}
                disabled={locating}
                className="btn-secondary text-xs"
              >
                {locating ? '📍 Detecting...' : '📍 Detect My Location'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Latitude</label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  placeholder="18.5204"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                />
              </div>
              <div>
                <label className="label text-xs">Longitude</label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  placeholder="73.8567"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="label text-xs">Address (optional)</label>
              <input
                type="text"
                className="input"
                placeholder="Street, landmark, area..."
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            {errors.location && <p className="text-xs text-red-600 mt-2">{errors.location}</p>}
          </div>

          {/* Images */}
          <div>
            <label className="label">Photos * (max 5, &lt;10MB each)</label>
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                const valid = files.filter((f) => f.type.startsWith('image/'));
                setImages(valid.slice(0, 5));
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="text-4xl mb-2">📸</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <span className="text-brand-600 font-medium">Click to upload</span> or drag &amp; drop
              </div>
              <div className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP up to 10MB</div>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img src={URL.createObjectURL(img)} alt="" className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute top-1 left-1 bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImages((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.images && <p className="text-xs text-red-600 mt-1">{errors.images}</p>}
          </div>

          {/* AI note */}
          <div className="bg-brand-50 dark:bg-brand-950/40 rounded-lg p-4 text-sm text-brand-900 dark:text-brand-200">
            <strong>🤖 AI Analysis:</strong> Once submitted, our computer vision module will analyze your photos
            and estimate the damage severity automatically. This typically takes 1-3 seconds.
          </div>

          {/* Submit */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting & analyzing...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
