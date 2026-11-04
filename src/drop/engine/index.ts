// Drop : moteur de planning (sans dépendance à l'interface ni à la base de données).
export { generatePlan, modeFor, proposeSingleDates } from "./generate";
export { reschedule, summarize, type ExistingTask, type ReschedulePreview, type RescheduleOptions } from "./reschedule";
export { addDays, diffDays, isIsoDate, jLabel, todayInParis } from "./dates";
export type * from "./types";
