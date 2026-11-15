// One season: big crop tiles with icon and name, one choice. Used for "pick your last crops" and for correcting a year.
import type { CropId, CropTraits } from '../../contracts';
import { t } from '../../app/i18n';
import { cropName } from '../shared/cropName';
import { CropIcon } from './cropIcons';

export function CropPicker(props: {
  year: number;
  crops: CropTraits[];
  value: CropId | undefined;
  onPick: (crop: CropId) => void;
}) {
  const { year, crops, value, onPick } = props;
  return (
    <div role="radiogroup" aria-label={t('steps.crops.pickerLabel', { year })} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {crops.map((crop) => {
        const chosen = value === crop.id;
        return (
          <button
            key={crop.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onPick(crop.id)}
            className={`flex min-h-[64px] cursor-pointer items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/40 ${
              chosen ? 'border-zinc-900 bg-lime-100 text-zinc-950' : 'border-zinc-300 border-b-zinc-400 bg-white text-zinc-800 hover:border-zinc-500'
            }`}
          >
            <span className="shrink-0">
              <CropIcon crop={crop.id} size={28} />
            </span>
            <span className="text-base font-medium leading-tight text-zinc-900">{cropName(crop.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
