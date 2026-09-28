// The manifest of the ECB, read strictly, lives with the ECB (`ecb/manifest.ts`)
// since the web reads it too (feature 016, E3): the web never reaches the code
// of the jobs. Kept here for the jobs' own door.

export { type ActiveHistory, activeHistoryOf } from "../ecb/manifest.js";
