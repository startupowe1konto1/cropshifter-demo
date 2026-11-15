// Text that is not a number from the analysis. Numbers come only from data/field.json.
// Shared file: only the lead session edits it (pitch/PLAN.md, "How to run this plan").

// D13: the owner named the app and the project CropShifter (Sun 15 Nov 2026). Change the name here and in index.html.
export const PROJECT_NAME = 'CropShifter';

export const TEAM = 'Vibecodersi';

// As the pitch owner sent them (P0, Sun 15 Nov 2026).
export const MEMBERS = [
  'Mikołaj Konieczny',
  'Mateusz Wojciechowski',
  'Oskar Pelzer',
  'Wojciech Rudnicki',
];

export const EVENT = 'NASA Space Apps Challenge 2026';
export const CHALLENGE = 'Field Shift: Adapting Farms with NASA Data';
export const LOCAL_EVENT = 'Poznań';

// The engine slide (src/slides/04-engine.js, "replay on the field") is parked: the pitch owner took it out on
// Sun 15 Nov 2026. true puts it back between the data slide and the regions slide; nothing else needs to change.
export const SHOW_ENGINE_SLIDE = false;

// The app's public URL. null until it is hosted; slide 7 then prints no link and no QR code.
// The QR code image (assets/img/qr-app.png) encodes exactly this URL; change both together.
export const APP_URL = 'https://cropshifter-demo.vercel.app/?lang=pl';

// The scale line on slide 2. Source: FAO newsroom, 14 April 2021, "Small family farmers produce a third of the world's
// food", https://www.fao.org/newsroom/detail/small-family-farmers-produce-a-third-of-the-world-s-food/en
export const FARMS_WORLD = { lead: 'Over 608 million', rest: 'family farms worldwide decide like Jan.', source: 'FAO, 2021' };

// The PDF lives in the repo (pitch/out/deck.pdf) and becomes public with the repo.
export const PDF_PATH = 'pitch/out/deck.pdf';
