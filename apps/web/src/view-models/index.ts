export {
  ATTENTION_CODES,
  type AttentionInput,
  type AttentionItem,
  type AttentionSeverity,
  attentionDestination,
  attentionItems,
} from "./attention.js";
export { type DetailField, type DetailView, detailView } from "./detail.js";
export { type MovementRow, movementRow, movementRows, PAGE_SIZE } from "./movements.js";
export {
  type BlockKey,
  type NetWorthBlock,
  type NetWorthLine,
  type NetWorthView,
  netWorthView,
} from "./networth.js";
export { type Onboarding, type OnboardingStep, onboardingOf, type StepKey } from "./onboarding.js";
export {
  candidateSettings,
  type NumberSetting,
  type PerAssetTypeKey,
  perAssetTypeValue,
  SETTINGS_NUMBERS,
  SETTINGS_TEXTS,
  type SettingsPatch,
  settingsTouched,
  settingText,
  settingValue,
  type TextSetting,
  targetWeightTotal,
  type WeightDraft,
  type WeightTotal,
  weightValues,
  withNumber,
  withOption,
  withPerAssetType,
  withText,
} from "./settings.js";
