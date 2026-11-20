/** CKBoost Design system, Figma nxsPSskHMjrxLYW8AWTf5N, page 0:1.
 * Semantic names are shared by both modes; values never reach the legacy root.
 */
export const tagTones = [
  "amber", "blue", "cyan", "green", "magenta", "neutral", "rose", "teal", "violet",
] as const;
export type TagTone = (typeof tagTones)[number];

const common = {
  "brand-primary": "#2A21F8",
  "brand-accent": "#CA20D0",
  "action-primary": "#2A21F8",
  "action-primary-border": "#2A21F8",
  "action-primary-hover": "#241CCF",
  "action-primary-pressed": "#1F18B0",
  "action-on-primary": "#FFFFFF",
};

const light = {
  ...common,
  "background-canvas": "#F7F7FC",
  "background-surface": "#FFFFFF",
  "background-raised": "#FFFFFF",
  "background-subtle": "#F0F0F8",
  "background-hover": "#E8E8F5",
  "text-primary": "#141426",
  "text-secondary": "#52526B",
  "text-muted": "#666680",
  "text-link": "#2A21F8",
  "focus-ring": "#2A21F8",
  "border-subtle": "#DCDCEA",
  "border-strong": "#808099",
  "brand-text": "#2A21F8",
  "brand-subtle": "#EEEDFF",
  "accent-text": "#B01BB5",
  "accent-subtle": "#FCECFD",
  "action-secondary": "#FFFFFF",
  "action-secondary-hover": "#F0F0F8",
  "action-secondary-pressed": "#E8E8F5",
  "action-on-secondary": "#141426",
  "action-secondary-border": "#808099",
  "action-disabled": "#E8E8F5",
  "action-on-disabled": "#666680",
  "tag-amber-surface": "#FFF8E5", "tag-amber-text": "#A16207",
  "tag-blue-surface": "#EEF4FF", "tag-blue-text": "#2455A6",
  "tag-cyan-surface": "#E6FAFF", "tag-cyan-text": "#07647A",
  "tag-green-surface": "#EDF9F1", "tag-green-text": "#15803D",
  "tag-magenta-surface": "#FCECFD", "tag-magenta-text": "#A318A7",
  "tag-neutral-surface": "#F0F0F8", "tag-neutral-text": "#52526B",
  "tag-rose-surface": "#FFF0F2", "tag-rose-text": "#B91C1C",
  "tag-teal-surface": "#E7FAF5", "tag-teal-text": "#116B59",
  "tag-violet-surface": "#EEEDFF", "tag-violet-text": "#1F18B0",
  "status-success-surface": "#EDF9F1", "status-success-text": "#15803D", "status-success-border": "#15803D",
  "status-warning-surface": "#FFF8E5", "status-warning-text": "#A16207", "status-warning-border": "#A16207",
  "status-error-surface": "#FFF0F2", "status-error-text": "#B91C1C", "status-error-border": "#B91C1C",
  "status-info-surface": "#F0EFFF", "status-info-text": "#4338CA", "status-info-border": "#4338CA",
};

const dark: Record<keyof typeof light, string> = {
  ...common,
  "background-canvas": "#10101B",
  "background-surface": "#191927",
  "background-raised": "#222234",
  "background-subtle": "#2B2B40",
  "background-hover": "#39394F",
  "text-primary": "#F7F7FC",
  "text-secondary": "#C0C0D4",
  "text-muted": "#A5A5C0",
  "text-link": "#C2BFFF",
  "focus-ring": "#C2BFFF",
  "border-subtle": "#39394F",
  "border-strong": "#8989A3",
  "brand-text": "#B8B3FF",
  "brand-subtle": "#242044",
  "accent-text": "#F4A5F5",
  "accent-subtle": "#351C38",
  "action-primary-border": "#7D74FF",
  "action-secondary": "#191927",
  "action-secondary-hover": "#2B2B40",
  "action-secondary-pressed": "#39394F",
  "action-on-secondary": "#F7F7FC",
  "action-secondary-border": "#8989A3",
  "action-disabled": "#2B2B40",
  "action-on-disabled": "#8989A3",
  "tag-amber-surface": "#302513", "tag-amber-text": "#FBBF24",
  "tag-blue-surface": "#182844", "tag-blue-text": "#A8C9FF",
  "tag-cyan-surface": "#102E38", "tag-cyan-text": "#7DDDF0",
  "tag-green-surface": "#102B21", "tag-green-text": "#4ADE80",
  "tag-magenta-surface": "#351C38", "tag-magenta-text": "#F4A5F5",
  "tag-neutral-surface": "#2B2B40", "tag-neutral-text": "#C0C0D4",
  "tag-rose-surface": "#321A25", "tag-rose-text": "#FB7185",
  "tag-teal-surface": "#112E29", "tag-teal-text": "#80DECA",
  "tag-violet-surface": "#242044", "tag-violet-text": "#C2BFFF",
  "status-success-surface": "#102B21", "status-success-text": "#4ADE80", "status-success-border": "#42B978",
  "status-warning-surface": "#302513", "status-warning-text": "#FBBF24", "status-warning-border": "#D9A72A",
  "status-error-surface": "#321A25", "status-error-text": "#FB7185", "status-error-border": "#E55C75",
  "status-info-surface": "#211E48", "status-info-text": "#A8A3FF", "status-info-border": "#8A83F5",
};

export const themeTokens = { light, dark };
export type RevampTheme = keyof typeof themeTokens;
export const spacing = [0, 2, 4, 8, 16, 24, 32, 40, 48, 72] as const;
export const radii = [0, 4, 8, 16, 24] as const;
export const typography = {
  h1: [40, 48, 700], h2: [32, 40, 700], h3: [24, 32, 700],
  h4: [20, 28, 700], h5: [18, 24, 700],
  subheader1: [16, 24, 700], subheader2: [14, 20, 700],
  body1: [16, 24, 400], body2: [14, 20, 400],
  caption: [12, 16, 400], label: [12, 16, 500], code: [14, 20, 400],
} as const;
export type TypographyVariant = keyof typeof typography;
