import { useEffect, useRef, useState } from 'react';
import { createDraft, createAndSubmitReport, updateDraft, submitReport } from '../store';
import { Category, Priority, type Report, type ReportInput } from '../types';
import { validateReport } from '../validation';

interface ReportFormProps {
  onReportSaved: (report: Report) => void;
  editingDraft?: Report | null;
  onCancelEdit?: () => void;
}

function getLocalDatetimeString(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function ReportForm({ onReportSaved, editingDraft, onCancelEdit }: ReportFormProps) {
  const [category, setCategory] = useState<Category>(Category.WATER_POINT);
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM);
  const [description, setDescription] = useState<string>('');
  const [locationText, setLocationText] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [reportedAt, setReportedAt] = useState<string>(getLocalDatetimeString());
  const [reporterName, setReporterName] = useState<string>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const lastLoadedDraftIdRef = useRef<string | null>(null);

  const resetForm = () => {
    setCategory(Category.WATER_POINT);
    setPriority(Priority.MEDIUM);
    setDescription('');
    setLocationText('');
    setLatitude('');
    setLongitude('');
    setReportedAt(getLocalDatetimeString());
    setReporterName('');
    setErrors({});
    setGpsMessage(null);
  };

  useEffect(() => {
    if (editingDraft) {
      if (lastLoadedDraftIdRef.current !== editingDraft.id) {
        lastLoadedDraftIdRef.current = editingDraft.id;
        setCategory(editingDraft.category as Category);
        setPriority(editingDraft.priority as Priority);
        setDescription(editingDraft.description || '');
        setLocationText(editingDraft.location_text || '');
        setLatitude(
          editingDraft.latitude !== null && editingDraft.latitude !== undefined
            ? String(editingDraft.latitude)
            : ''
        );
        setLongitude(
          editingDraft.longitude !== null && editingDraft.longitude !== undefined
            ? String(editingDraft.longitude)
            : ''
        );
        const dt = editingDraft.reported_at ? new Date(editingDraft.reported_at) : new Date();
        setReportedAt(isNaN(dt.getTime()) ? getLocalDatetimeString() : getLocalDatetimeString(dt));
        setReporterName(editingDraft.reporter_name || '');
        setErrors({});
        setGpsMessage(null);
      }
    } else {
      if (lastLoadedDraftIdRef.current !== null) {
        lastLoadedDraftIdRef.current = null;
        resetForm();
      }
    }
  }, [editingDraft]);

  const handleCancel = () => {
    lastLoadedDraftIdRef.current = null;
    resetForm();
    setStatusMessage(null);
    if (onCancelEdit) {
      onCancelEdit();
    }
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      setGpsMessage('Geolocation is not supported by this browser.');
      return;
    }

    setGpsLoading(true);
    setGpsMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
        setGpsMessage('GPS coordinates captured.');
      },
      (err) => {
        setGpsLoading(false);
        setGpsMessage(`Location capture failed: ${err.message}`);
      },
      { timeout: 10000 }
    );
  };

  const buildReportInput = (): ReportInput => {
    const isoReportedAt = reportedAt ? new Date(reportedAt).toISOString() : new Date().toISOString();
    return {
      category,
      priority,
      description: description.trim(),
      location_text: locationText.trim(),
      latitude: latitude !== '' ? Number(latitude) : null,
      longitude: longitude !== '' ? Number(longitude) : null,
      reported_at: isoReportedAt,
      reporter_name: reporterName.trim() || null,
    };
  };

  const handleSave = async (submitImmediately: boolean) => {
    setStatusMessage(null);
    const input = buildReportInput();

    const validation = validateReport(input);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});

    try {
      let savedReport: Report;
      if (editingDraft) {
        if (submitImmediately) {
          await updateDraft(editingDraft.id, input);
          savedReport = await submitReport(editingDraft.id);
          setStatusMessage(`Report ${savedReport.id.slice(0, 8)} submitted locally (Not synchronized).`);
          lastLoadedDraftIdRef.current = null;
          resetForm();
          if (onCancelEdit) onCancelEdit();
          onReportSaved(savedReport);
        } else {
          savedReport = await updateDraft(editingDraft.id, input);
          setStatusMessage(`Draft ${savedReport.id.slice(0, 8)} updated locally. You can continue editing or submit when ready.`);
          onReportSaved(savedReport);
        }
      } else {
        if (submitImmediately) {
          savedReport = await createAndSubmitReport(input);
          setStatusMessage(`Report ${savedReport.id.slice(0, 8)} submitted locally (Not synchronized).`);
          lastLoadedDraftIdRef.current = null;
          resetForm();
          onReportSaved(savedReport);
        } else {
          savedReport = await createDraft(input);
          setStatusMessage(`Draft ${savedReport.id.slice(0, 8)} saved locally. You can continue editing or submit when ready.`);
          lastLoadedDraftIdRef.current = savedReport.id;
          onReportSaved(savedReport);
        }
      }
    } catch (err: any) {
      setErrors({ form: err.message || 'Failed to save report.' });
    }
  };

  return (
    <section style={{ border: '1px solid #ccc', padding: '1.25rem', borderRadius: '4px', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>
          {editingDraft ? `Edit Draft Report (${editingDraft.id.slice(0, 8)})` : 'New Field Report'}
        </h2>
        {editingDraft && (
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              backgroundColor: '#fffbe6',
              border: '1px solid #ffe58f',
              color: '#d48806',
              fontSize: '0.85rem',
              fontWeight: 'bold',
            }}
          >
            Draft Mode
          </span>
        )}
      </div>

      {editingDraft && (
        <div
          style={{
            backgroundColor: '#e6f4ff',
            border: '1px solid #91caff',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#0958d9' }}>
            <strong>Editing Draft:</strong> You can continue modifying details below and update the draft or submit it.
          </div>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              backgroundColor: '#fff',
              border: '1px solid #91caff',
              borderRadius: '3px',
              color: '#0958d9',
              fontWeight: 'bold',
            }}
          >
            Cancel Edit / New Report
          </button>
        </div>
      )}

      {statusMessage && (
        <div style={{ backgroundColor: '#e6ffed', border: '1px solid #b7eb8f', padding: '0.75rem', marginBottom: '1rem', borderRadius: '4px' }}>
          {statusMessage}
        </div>
      )}

      {errors.form && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '0.75rem', marginBottom: '1rem', borderRadius: '4px' }}>
          {errors.form}
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Category *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            style={{ width: '100%', maxWidth: '400px', padding: '0.5rem' }}
          >
            {Object.values(Category).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {errors.category && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.category}</div>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Priority *
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            style={{ width: '100%', maxWidth: '400px', padding: '0.5rem' }}
          >
            {Object.values(Priority).map((prio) => (
              <option key={prio} value={prio}>
                {prio}
              </option>
            ))}
          </select>
          {errors.priority && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.priority}</div>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Description * (10 - 1,000 characters)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe the issue in detail..."
            style={{ width: '100%', maxWidth: '600px', padding: '0.5rem' }}
          />
          <div style={{ fontSize: '0.8rem', color: '#666' }}>{description.length} / 1000 characters</div>
          {errors.description && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.description}</div>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Location Description * (max 200 characters)
          </label>
          <input
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g. Village well pump #2, East district"
            style={{ width: '100%', maxWidth: '600px', padding: '0.5rem' }}
          />
          {errors.location_text && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.location_text}</div>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Manual Coordinates (Optional, both or neither)
          </label>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem' }}>Latitude (-90 to 90)</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="e.g. -1.2921"
                style={{ width: '180px', padding: '0.5rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem' }}>Longitude (-180 to 180)</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="e.g. 36.8219"
                style={{ width: '180px', padding: '0.5rem' }}
              />
            </div>
            <div style={{ paddingTop: '1.25rem' }}>
              <button
                type="button"
                onClick={handleCaptureLocation}
                disabled={gpsLoading}
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
              >
                {gpsLoading ? 'Capturing GPS...' : 'Capture GPS Coordinates'}
              </button>
            </div>
          </div>
          {gpsMessage && <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.25rem' }}>{gpsMessage}</div>}
          {errors.latitude && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.latitude}</div>}
          {errors.longitude && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.longitude}</div>}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Date & Time Reported *
          </label>
          <input
            type="datetime-local"
            value={reportedAt}
            onChange={(e) => setReportedAt(e.target.value)}
            style={{ padding: '0.5rem' }}
          />
          {errors.reported_at && <div style={{ color: 'red', fontSize: '0.85rem' }}>{errors.reported_at}</div>}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Reporter Name (Optional)
          </label>
          <input
            type="text"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="Field worker name or identifier"
            style={{ width: '100%', maxWidth: '400px', padding: '0.5rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleSave(false)}
            style={{
              padding: '0.6rem 1.25rem',
              cursor: 'pointer',
              backgroundColor: editingDraft ? '#faad14' : '#f0f0f0',
              color: editingDraft ? '#000' : '#1a1a1a',
              border: editingDraft ? '1px solid #d48806' : '1px solid #ccc',
              borderRadius: '4px',
              fontWeight: editingDraft ? 'bold' : 'normal',
            }}
          >
            {editingDraft ? 'Update Draft' : 'Save as Draft'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            style={{
              padding: '0.6rem 1.25rem',
              cursor: 'pointer',
              backgroundColor: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
            }}
          >
            Submit Report
          </button>
          {editingDraft && (
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '0.6rem 1.25rem',
                cursor: 'pointer',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>
    </section>
  );
};
