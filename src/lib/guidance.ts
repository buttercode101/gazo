export type GuidanceAction =
  | 'map_ready'
  | 'filters_opened'
  | 'station_selected'
  | 'report_opened'
  | 'report_submitted'
  | 'details_opened';

export interface GuidanceStep {
  id: string;
  shortLabel: string;
  title: string;
  description: string;
  ctaLabel?: string;
  targetId?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  triggerAction: GuidanceAction;
  completeOnAction?: GuidanceAction;
}

export const GUIDANCE_STORAGE_KEY = 'tankup_guidance_v1';

export const GUIDANCE_STEPS: GuidanceStep[] = [
  {
    id: 'map-basics',
    shortLabel: 'Overview',
    title: 'Live map, instantly',
    description: 'Fuel pins update in real time. Tap any pin or station card to focus it.',
    ctaLabel: 'Start tour',
    targetId: 'guidance-map',
    placement: 'center',
    triggerAction: 'map_ready',
  },
  {
    id: 'smart-filters',
    shortLabel: 'Filters',
    title: 'Filter without noise',
    description: 'Use quick filters to show only nearby, verified, and fresh prices.',
    ctaLabel: 'Next tip',
    targetId: 'guidance-filters',
    placement: 'bottom',
    triggerAction: 'station_selected',
    completeOnAction: 'filters_opened',
  },
  {
    id: 'report-flow',
    shortLabel: 'Reporting',
    title: 'Keep prices fresh',
    description: 'Tap Report to submit updated fuel prices in a few seconds.',
    ctaLabel: 'Next tip',
    targetId: 'guidance-report',
    placement: 'left',
    triggerAction: 'filters_opened',
    completeOnAction: 'report_opened',
  },
  {
    id: 'station-intel',
    shortLabel: 'Insights',
    title: 'Use station intelligence',
    description: 'Open Trend to view price history, reviews, and set alerts.',
    ctaLabel: 'Finish',
    targetId: 'guidance-trend',
    placement: 'top',
    triggerAction: 'report_opened',
    completeOnAction: 'details_opened',
  },
];

export interface GuidanceState {
  dismissed: boolean;
  completedSteps: string[];
  actions: Partial<Record<GuidanceAction, boolean>>;
  lastShownAt?: number;
}

export const defaultGuidanceState: GuidanceState = {
  dismissed: false,
  completedSteps: [],
  actions: {},
};
