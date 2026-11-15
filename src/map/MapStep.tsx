// Step 1: find the field. The address search outlines the field at the place it finds (O1-F2), as does a tap on the
// map; a drawn outline and the list of fields work too, the list even when the map does not.
import { useEffect, useRef, useState } from 'react';
import { t } from '../app/i18n';
import { useAppStore } from '../app/store';
import type { Field } from '../contracts';
import { StateBoundary } from '../ui-kit/StateBoundary';
import { FieldList } from './draw/FieldList';
import { drawnField, reshapedField } from './draw/drawnField';
import { DemoPicker } from './demo/DemoPicker';
import { createLeafletMap, type MapController } from './leafletMap';
import { ParcelSearch } from './parcels/ParcelSearch';
import { cutField } from './parcels/editFields';
import { addFieldAt, useParcelTap } from './parcels/tap';

const BUTTON =
  'min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 active:bg-zinc-100';

export function MapStep() {
  const fields = useAppStore((s) => s.fields);
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const canUndo = useAppStore((s) => s.fieldHistory.length > 0);
  // While ULDK answers, the newest edit is not in the store yet; an undo then would take back the one before it.
  const tapPending = useParcelTap((s) => s.tap.status === 'loading');

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapController | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [cutting, setCutting] = useState(false);
  // The note is about the fields as they were when it was written; any later change to the list hides it.
  const [editNote, setEditNote] = useState<{ text: string; fields: Field[] } | null>(null);
  const [parcelsOn, setParcelsOn] = useState(false);
  const [parcelsFailed, setParcelsFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      mapRef.current = createLeafletMap(container, {
        // Read the store at call time, so the handlers never hold a stale action.
        onClick: (lat, lon) => {
          // While drawing, editing or deleting, a tap belongs to that tool, not to the quick add.
          if (mapRef.current?.isEditing()) return;
          void addFieldAt(lat, lon); // in Poland, the ULDK parcel; elsewhere a 4 ha square
        },
        onTileError: () => setTilesFailed(true),
        onSelectField: (id) => useAppStore.getState().selectField(id),
        onDrawn: (polygon) => {
          const { fields, addField } = useAppStore.getState();
          addField(drawnField(polygon, fields)); // addField also selects it
        },
        onEdited: (id, polygon) => {
          const { fields, updateField } = useAppStore.getState();
          const field = fields.find((f) => f.id === id);
          if (field) updateField(reshapedField(field, polygon));
        },
        onRemoved: (id) => useAppStore.getState().removeField(id),
        onCut: (line) => {
          const { selectedFieldId: id, fields } = useAppStore.getState();
          const parent = fields.find((f) => f.id === id);
          const outcome = parent ? cutField(parent.id, line) : ({ ok: false, reason: 'no-field' } as const);
          const note = (text: string) => setEditNote({ text, fields: useAppStore.getState().fields });
          if (!parent || !outcome.ok) return note(t(`edit.cut.fail.${outcome.ok ? 'no-field' : outcome.reason}`));
          const [a, b] = outcome.fields;
          note(t('edit.cut.done', { name: parent.name, a: a.name, b: b.name }));
        },
        onCutMode: (active) => {
          setCutting(active);
          if (active) setEditNote(null);
        },
        onParcelLayerError: () => setParcelsFailed(true),
      });
    } catch {
      setMapFailed(true);
    }
    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setFields(fields, selectedFieldId);
  }, [fields, selectedFieldId]);

  // Fly only when the selection changes, not on every redraw of the list.
  useEffect(() => {
    const field = useAppStore.getState().fields.find((f) => f.id === selectedFieldId);
    if (field) mapRef.current?.flyTo(field);
  }, [selectedFieldId]);

  const toggleParcels = (on: boolean) => {
    setParcelsOn(on);
    setParcelsFailed(false);
    mapRef.current?.setParcelLayer(on);
  };

  const retryParcels = () => {
    setParcelsFailed(false);
    mapRef.current?.setParcelLayer(false);
    mapRef.current?.setParcelLayer(true);
  };

  const retryTiles = () => {
    setTilesFailed(false);
    mapRef.current?.retryTiles();
  };

  return (
    <div className="grid gap-4">
      <p className="text-base text-zinc-700">{t('map.intro')}</p>

      <DemoPicker />


      {tilesFailed ? (
        <StateBoundary state="error" source={t('map.tiles.source')} reason={t('map.tiles.reason')} onRetry={retryTiles}>
          {null}
        </StateBoundary>
      ) : null}
      {parcelsFailed ? (
        <StateBoundary state="error" source={t('edit.layer.source')} reason={t('edit.layer.error')} onRetry={retryParcels}>
          {null}
        </StateBoundary>
      ) : null}
      {mapFailed ? (
        <StateBoundary state="error" source={t('map.source')} reason={t('map.tiles.reason')}>
          {null}
        </StateBoundary>
      ) : null}

      <div>
        <div
          ref={containerRef}
          role="application"
          aria-label={t('map.label')}
          className="h-[55vh] min-h-64 w-full overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 md:h-[60vh]"
        />
        <p className="mt-2 text-sm text-zinc-600">{t('map.hint')}</p>
        <p className="mt-1 text-sm text-zinc-600">{t('draw.hint')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            className={BUTTON}
            disabled={!cutting && !selectedFieldId}
            onClick={() => (cutting ? mapRef.current?.stopCut() : mapRef.current?.startCut())}
          >
            {cutting ? t('edit.cut.cancel') : t('edit.cut.start')}
          </button>
          <button
            type="button"
            className={`${BUTTON} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!canUndo || cutting || tapPending}
            onClick={() => {
              useAppStore.getState().undoFieldEdit();
              setEditNote({ text: t('edit.undo.done'), fields: useAppStore.getState().fields });
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.5 5 3.5 9l4 4" />
              <path d="M3.5 9H12a4.5 4.5 0 0 1 0 9h-2" />
            </svg>
            {t('edit.undo.button')}
          </button>
          <label className="flex min-h-11 items-center gap-2 text-base text-zinc-900">
            <input
              type="checkbox"
              checked={parcelsOn}
              onChange={(e) => toggleParcels(e.target.checked)}
              className="h-6 w-6 shrink-0 accent-zinc-900"
            />
            {t('edit.layer.label')}
          </label>
        </div>
        {parcelsOn ? <p className="mt-1 text-sm text-zinc-600">{t('edit.layer.hint')}</p> : null}
        <div role="status" className="mt-2 text-base text-zinc-900">
          {cutting ? t('edit.cut.hint') : editNote?.fields === fields ? editNote.text : null}
        </div>
      </div>

      {/* The demo opens on the two fields from the presentation; finding another parcel by number stays visible but off. */}
      <fieldset disabled aria-describedby="demo-off" className="grid gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 opacity-60">
        <p id="demo-off" className="text-sm font-medium text-zinc-700">
          {t('demo.off')}
        </p>
        <ParcelSearch />
      </fieldset>

      <FieldList />
    </div>
  );
}
