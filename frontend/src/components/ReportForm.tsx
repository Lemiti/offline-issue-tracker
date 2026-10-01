import { useState } from 'react';
import { createDraft, createAndSubmitReport } from '../store';
import { Category, Priority, type Report, type ReportInput } from '../types';
import { validateReport } from '../validation';

interface ReportFormProps {
  onReportSaved: (report: Report) => void;
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

export function ReportForm({ onReportSaved }: ReportFormProps) {
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
      if (submitImmediately) {
        savedReport = await createAndSubmitReport(input);
        setStatusMessage(`Report ${savedReport.id.slice(0, 8)} submitted locally (Not synchronized).`);
      } else {
        savedReport = await createDraft(input);
        setStatusMessage(`Draft ${savedReport.id.slice(0, 8)} saved locally.`);
      }

      resetForm();
      onReportSaved(savedReport);
    } catch (err: any) {
      setErrors({ form: err.message || 'Failed to save report.' });
    }
  };

  return (
    <section style={{ border: '1px solid #ccc', padding: '1.25rem', borderRadius: '4px', marginBottom: '2rem' }}>
      <h2 style={{ marginTop: 0 }}>New Field Report</h2>

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

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => handleSave(false)}
            style={{ padding: '0.6rem 1.25rem', cursor: 'pointer', backgroundColor: '#f0f0f0', border: '1px solid #ccc' }}
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            style={{ padding: '0.6rem 1.25rem', cursor: 'pointer', backgroundColor: '#0066cc', color: '#fff', border: 'none' }}
          >
            Submit Report
          </button>
        </div>
      </form>
    </section>
  );
};
