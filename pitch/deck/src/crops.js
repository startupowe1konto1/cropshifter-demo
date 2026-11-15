// Crop names as the app prints them: copied from src/steps/shared/messages/en.json at commit a19da90.
// Shared file: only the lead session edits it. A crop id without a name throws, so a new crop in
// data/field.json cannot reach a slide as a raw id.
const NAMES = {
  'alfalfa': 'Alfalfa',
  'cereal-rye': 'Cereal rye (cover)',
  'field-pea': 'Field pea',
  'maize': 'Maize',
  'oats': 'Oats',
  'phacelia': 'Phacelia',
  'potato': 'Potato',
  'red-clover': 'Red clover',
  'rye': 'Rye',
  'soybean': 'Soybean',
  'spring-barley': 'Spring barley',
  'sugar-beet': 'Sugar beet',
  'white-mustard': 'White mustard',
  'winter-rapeseed': 'Winter rapeseed',
  'winter-wheat': 'Winter wheat',
};

export function cropName(id) {
  const name = NAMES[id];
  if (!name) throw new Error(`crops.js: no name for crop id "${id}"`);
  return name;
}

/** One rotation's crops as plain text: "Field pea → Winter wheat → Potato + phacelia". */
export function rotationText(rotation) {
  return rotation.crops
    .map((c) => (c.coverCrop ? `${cropName(c.crop)} + ${cropName(c.coverCrop).toLowerCase()}` : cropName(c.crop)))
    .join(' → ');
}
