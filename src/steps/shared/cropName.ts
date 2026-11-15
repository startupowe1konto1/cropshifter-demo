// Display name of a crop id. Crop tables (data/crops/, O4) carry no names, so the names live in this folder's messages.
import { dictionary, t } from '../../app/i18n';
import type { CropId } from '../../contracts';

/** 'winter-wheat' -> 'Winter wheat' from the message file; an id without a text is shown readable, not hidden. */
export function cropName(id: CropId): string {
  const code = `crop.${id}`;
  if (code in dictionary) return t(code);
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
