// The five care actions — the game's verbs. Ids are save-data (schema.ts
// favourite-care snapshots store them); labels/icons are display only.

export const CARE_ACTION_IDS = ['feed', 'pet', 'clean', 'play', 'treat'] as const;
export type CareActionId = (typeof CARE_ACTION_IDS)[number];

export interface CareAction {
  id: CareActionId;
  label: string;
  icon: string;
  /** Story slot {favActivity} (PHASE0-DEEP-DIVE §B.5.2). */
  activityPhrase: string;
}

export const CARE_ACTIONS: Record<CareActionId, CareAction> = {
  feed: { id: 'feed', label: 'Feed', icon: '🥣', activityPhrase: 'snack time' },
  pet: { id: 'pet', label: 'Pet', icon: '💗', activityPhrase: 'cuddle time' },
  clean: {
    id: 'clean',
    label: 'Clean',
    icon: '🫧',
    activityPhrase: 'bath time, all fluffy after',
  },
  play: { id: 'play', label: 'Play', icon: '🎾', activityPhrase: 'playtime' },
  treat: { id: 'treat', label: 'Give Treat', icon: '🍪', activityPhrase: 'treat time' },
};

export const CARE_ACTION_LIST: CareAction[] = CARE_ACTION_IDS.map(
  (id) => CARE_ACTIONS[id],
);

/** Generic speech lines, 4 per action — the base pool trait lines season
 * (§B3.1). Re-created for the repo build in the original's spirit:
 * short, happy, speakable in one breath. */
export const GENERIC_LINES: Record<CareActionId, string[]> = {
  feed: [
    'Yum! Thank you!',
    'My tummy feels happy!',
    'That was so tasty!',
    'More happy belly sounds!',
  ],
  pet: [
    'That feels so nice.',
    'I love gentle pets.',
    'Right there — perfect.',
    'You make me feel safe.',
  ],
  clean: [
    'Bubbles! So tickly!',
    'Look how shiny I am!',
    'Clean and cozy!',
    'Splashy and fresh!',
  ],
  play: [
    'That was so fun!',
    'Again, again!',
    'You play the best games!',
    'Wheee! Best day ever!',
  ],
  treat: [
    'A treat! For me?',
    'Crunchy and yummy!',
    'You remembered my favourite!',
    'Best surprise ever!',
  ],
};

/** Arrival greeting when no trait has been met yet / generic first bubble. */
export const ARRIVAL_LINES: string[] = [
  'Hi! I am new here.',
  'Hello, friend!',
  'I am a little nervous… and happy!',
];
