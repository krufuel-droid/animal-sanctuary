import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CURRENT_SAVE_VERSION,
  type AlbumEntry,
  type GameState,
  type Rescue,
  type SpeciesId,
  type TraitId,
} from './save/schema';
import { loadSave, parseImport, saveSave, serializeExport } from './save/storage';
import { newMasterSeed } from './save/rng';
import { CARE_ACTION_LIST, GENERIC_LINES, type CareActionId } from './game/care';
import { TRAITS, rollTrait } from './game/traits';
import { ROSTER_ORDER, SPECIES } from './game/roster';
import { OUTFITS, AnimalSvg, type OutfitId, type SleepState } from './game/animals';
import { YardProp } from './game/props';
import { YardSim, type SimSnapshot } from './sim/yardSim';
import { deriveAiProfile } from './sim/traits-ai';
import { absenceCatchUp, NEED_ICONS, type Needs } from './sim/needs';
import { YARD_LAYOUT } from './sim/advertisers';
import { ADOPTERS_BY_ID, homeRootOf } from './game/adopters';
import { Snd } from './audio/sound';
import SoundLab from './audio/Lab';
import { audioPrefsOf, DEFAULT_AUDIO_PREFS, type AudioPrefs } from './save/schema';
import {
  applyAdoptionCooldowns,
  generateOffer,
  hintFor,
  isPerfectMatch,
  scoreAdopter,
  type AnimalProfile,
} from './game/matching';
import { generateStory } from './game/stories';
import {
  AdopterCard,
  AnimalStage,
  HOME_THEMES,
  Medallion,
  TraitChip,
  type StageHandle,
} from './game/components';

// Animal Sanctuary — repo build (Phase 1). Game rules are Phase 0's, exactly:
// 2 coins per care tap, +30 per adoption, 8 hearts, shop 10/15/20/25/30,
// visits are affection-only. Saves are one whole v4 document in localStorage
// (src/save), migrated client-side before the first write, and a save that
// cannot be read is reported — never overwritten.

const STORAGE: Storage = window.localStorage;

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeRescue(
  speciesIdx: number,
  rngSeed: number,
  arrivalIndex: number,
  previousTraitId: TraitId | null,
): Rescue {
  const species = ROSTER_ORDER[speciesIdx];
  const { traitId, traitSeed } = rollTrait(species, rngSeed, arrivalIndex, previousTraitId);
  // Phase 2: the autonomy profile is rolled from the SEPARATE AI stream at
  // arrival and stored (§4.3); arrival needs come from the same stream.
  const ai = deriveAiProfile(rngSeed, arrivalIndex, traitId);
  return {
    species,
    name: SPECIES[species].defaultName,
    hearts: 0,
    outfit: null,
    instanceId: `arr-${arrivalIndex}`,
    traitId,
    traitSeed,
    traitSource: 'rolled',
    favBonusCount: 0,
    favBonusLastDate: null,
    needs: ai.arrivalNeeds,
    aiProfile: { weights: ai.weights, metabolism: ai.metabolism, aiSeed: ai.aiSeed },
    aiProfileSource: 'rolled',
  };
}

function freshState(seed: number = newMasterSeed()): GameState {
  return {
    version: CURRENT_SAVE_VERSION,
    coins: 0,
    ownedItems: [],
    adoptedCount: 0,
    rotationIndex: 0,
    phase: 'caring',
    current: makeRescue(0, seed, 1, null),
    album: [],
    rngSeed: seed,
    arrivalIndex: 1,
    pendingAdoption: null,
    adopterCooldowns: {},
    lastOfferIds: [],
    lastStoryTemplateIds: null,
    lastSeenAt: Date.now(),
  };
}

/** Apply the §1.3 absence catch-up to a freshly loaded/imported state:
 * needs ease toward "ready for company" — never below the floor of 35,
 * never a punishment. Pre-v5 saves (no lastSeenAt) skip it entirely. */
function withLoadCatchUp(state: GameState): GameState {
  if (!state.current.needs || typeof state.lastSeenAt !== 'number') return state;
  const elapsed = (Date.now() - state.lastSeenAt) / 1000;
  if (!(elapsed > 0)) return state;
  const adjusted = absenceCatchUp(state.current.needs, elapsed);
  const changed = (Object.keys(adjusted) as (keyof Needs)[]).some(
    (k) => Math.abs(adjusted[k] - state.current.needs![k]) > 0.001,
  );
  if (!changed) return state;
  return { ...state, current: { ...state.current, needs: adjusted } };
}

/** Debug readout (UTILITY-AI-DEEP-DIVE §8 D-checks): ?debug=1 shows the
 * needs/action/scores panel and exposes window.__yard for probes. */
const DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debug');

/** Has anything the player can see changed between two sim snapshots?
 * Positions compare at half-unit grain (the CSS transition smooths the
 * rest); the debug panel additionally wants the numbers every tick. */
function simViewChanged(a: SimSnapshot | null, b: SimSnapshot): boolean {
  if (!a) return true;
  if (a.instanceId !== b.instanceId || a.mode !== b.mode) return true;
  if ((a.action?.defId ?? '') !== (b.action?.defId ?? '')) return true;
  if ((a.action?.phase ?? '') !== (b.action?.phase ?? '')) return true;
  if (a.thought !== b.thought) return true;
  if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) return true;
  const grain = DEBUG ? 0.05 : 0.5;
  return (Object.keys(b.needs) as (keyof Needs)[]).some(
    (k) => Math.abs(a.needs[k] - b.needs[k]) > grain,
  );
}

type View = { kind: 'sanctuary' } | { kind: 'album' } | { kind: 'visit'; entryId: string };

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loadIssue, setLoadIssue] = useState<'corrupt' | 'future' | null>(null);
  const [view, setView] = useState<View>({ kind: 'sanctuary' });
  const [confirmReset, setConfirmReset] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [audioPrefs, setAudioPrefs] = useState<AudioPrefs>({ ...DEFAULT_AUDIO_PREFS });
  const [soundPop, setSoundPop] = useState(false);
  const prevPhase = useRef<string | null>(null);
  const stageRef = useRef<StageHandle | null>(null);
  const visitStageRef = useRef<StageHandle | null>(null);
  const celebrationRef = useRef<HTMLDivElement | null>(null);
  const favLineIdx = useRef(0);
  const otherLineUsedFor = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const gameRef = useRef<GameState | null>(null);
  gameRef.current = game;

  /* ---------- Phase 2: the yard sim (one resident, step 1) ----------
   * The sim is runtime state, rebuilt per resident from the save's stored
   * needs + aiProfile. It owns needs while it lives; commits copy its
   * needs back into the document (see commit/syncFromSim). */
  const simRef = useRef<YardSim | null>(null);
  const simForRef = useRef<string | null>(null);
  const [simView, setSimView] = useState<SimSnapshot | null>(null);
  const [simEpoch, setSimEpoch] = useState(0);
  const commitRef = useRef<(next: GameState) => void>(() => {});

  const ensureSim = useCallback((state: GameState): YardSim => {
    const cur = state.current;
    if (simRef.current && simForRef.current === cur.instanceId) {
      return simRef.current;
    }
    const traitId = (cur.traitId as TraitId | null) ?? null;
    const derived = deriveAiProfile(
      state.rngSeed,
      state.arrivalIndex,
      traitId ?? 'gentle',
    );
    const sim = new YardSim({
      instanceId: cur.instanceId,
      traitId,
      weights: cur.aiProfile?.weights ?? derived.weights,
      metabolism: cur.aiProfile?.metabolism ?? derived.metabolism,
      needs: cur.needs ?? derived.arrivalNeeds,
      rngSeed: state.rngSeed,
      arrivalIndex: state.arrivalIndex,
    });
    simRef.current = sim;
    simForRef.current = cur.instanceId;
    return sim;
  }, []);

  /** Copy the sim's live needs into a state about to be saved — but only
   * when the sim belongs to that state's resident (a Fresh Start or a new
   * arrival must never inherit the old resident's needs). */
  const syncFromSim = useCallback((state: GameState): GameState => {
    const sim = simRef.current;
    if (!sim || simForRef.current !== state.current.instanceId) return state;
    return { ...state, current: { ...state.current, needs: sim.getNeeds() } };
  }, []);

  /* ---------- load once: migrate in memory BEFORE any write (F1 fencing) */
  useEffect(() => {
    const result = loadSave(STORAGE);
    if (result.status === 'ok') {
      const caught = withLoadCatchUp(result.state);
      setGame(caught);
      const prefs = audioPrefsOf(caught);
      setAudioPrefs(prefs);
      Snd.loadPrefs(prefs, caught.rngSeed);
      if (result.migratedFrom < CURRENT_SAVE_VERSION || caught !== result.state) {
        try {
          saveSave(STORAGE, caught);
        } catch {
          /* the in-memory state is still good; the next commit retries */
        }
      }
    } else if (result.status === 'empty') {
      const fresh = freshState();
      setGame(fresh);
      try {
        saveSave(STORAGE, fresh);
      } catch {
        /* storage unavailable (private mode) — play session-only */
      }
    } else {
      setLoadIssue(result.status);
    }
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* persistent-storage request is best-effort (safety net layer 2) */
    }
  }, []);

  /* ---------- commit: set state + debounced whole-document write.
     Every commit syncs the sim's needs in and stamps lastSeenAt (the
     §1.3 catch-up clock) — needs ride the normal autosave cadence,
     never a per-tick write (§7.3). */
  const commit = useCallback(
    (next: GameState) => {
      const out: GameState = {
        ...syncFromSim(next),
        lastSeenAt: Date.now(),
      };
      setGame(out);
      gameRef.current = out;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        try {
          saveSave(STORAGE, out);
        } catch {
          /* state stays in memory; a later commit retries */
        }
      }, 300);
    },
    [syncFromSim],
  );
  commitRef.current = commit;

  /* flush the pending write when the page goes away */
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      if (gameRef.current) {
        try {
          saveSave(STORAGE, {
            ...syncFromSim(gameRef.current),
            lastSeenAt: Date.now(),
          });
        } catch {
          /* noop */
        }
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* ---------- sound: unlock on every pointerdown (capture); the engine
     latches, sets the iOS audio session on the first tap, and stays silent
     until then by design (SOUND-DESIGN-DEEP-DIVE §3.3). */
  useEffect(() => {
    const unlock = () => Snd.unlock();
    document.addEventListener('pointerdown', unlock, true);
    return () => document.removeEventListener('pointerdown', unlock, true);
  }, []);

  /* prefs changes (mute / volume) persist into the save's settings.audio */
  useEffect(() => {
    Snd.setOnPrefs((p) => {
      setAudioPrefs(p);
      const g = gameRef.current;
      if (g) commit({ ...g, settings: { audio: p } });
    });
  }, [commit]);

  /* the celebration sound fires on the caring → celebration FLIP only —
     never on a reload that lands mid-celebration */
  useEffect(() => {
    const phase = game?.phase ?? null;
    if (prevPhase.current === 'caring' && phase === 'celebration' && game?.current) {
      Snd.play('celebrate.adoption', { species: game.current.species, delay: 0.35 });
      Snd.duck('amb', -8);
    }
    if (phase !== null) prevPhase.current = phase;
  }, [game?.phase, game?.current]);

  /* bring the celebration into view when the phase flips (audit F3/C3) */
  useEffect(() => {
    if (game?.phase === 'celebration') {
      celebrationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [game?.phase]);

  /* ---------- Phase 2 driver: step the sim on a 100 ms cadence while
     the sanctuary yard is on screen, publish snapshots for rendering
     (only when something visible changed), and sync needs into the save
     on the autosave cadence. Sim time is real elapsed time at 1× — a
     hidden tab simply stops stepping (no catch-up burst, §7.2). */
  const currentInstanceId = game?.current.instanceId;
  useEffect(() => {
    if (view.kind !== 'sanctuary' || !gameRef.current || !currentInstanceId) return;
    const sim = ensureSim(gameRef.current);
    setSimView(sim.snapshot());
    // Date.now (not performance.now): the probes drive the yard with
    // Playwright's mocked clock, which fakes Date/timers but not
    // performance.now — an elapsed pump on performance.now would crawl
    // at real-time microseconds under fastForward. The 0.5 s dt clamp
    // bounds any wall-clock jump.
    let last = Date.now();
    let lastSync = Date.now();
    const iv = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.5, Math.max(0, (now - last) / 1000));
      last = now;
      if (dt > 0) sim.step(dt);
      const snap = sim.snapshot();
      setSimView((prev) => (simViewChanged(prev, snap) ? snap : prev));
      if (now - lastSync > 5000) {
        lastSync = now;
        const g = gameRef.current;
        if (g && g.current.instanceId === sim.instanceId) {
          const saved = g.current.needs;
          const drifted =
            !saved ||
            (Object.keys(snap.needs) as (keyof Needs)[]).some(
              (k) => Math.abs(snap.needs[k] - saved[k]) > 0.5,
            );
          if (drifted) commitRef.current({ ...g });
        }
      }
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind, currentInstanceId, simEpoch, ensureSim]);

  /* debug handle for the §8 D-check probes */
  useEffect(() => {
    if (!DEBUG) return;
    const w = window as unknown as { __yard?: unknown };
    w.__yard = {
      sim: () => simRef.current,
      snapshot: () => simRef.current?.snapshot() ?? null,
      step: (seconds: number) => simRef.current?.step(seconds),
      events: () => simRef.current?.events ?? [],
    };
  }, []);

  const current = game?.current;
  const currentTrait =
    current && current.traitId && current.traitId in TRAITS
      ? TRAITS[current.traitId as TraitId]
      : null;
  const bonusAvailable =
    !!current &&
    !!currentTrait &&
    current.favBonusCount < 2 &&
    current.favBonusLastDate !== todayLocal();

  const profile: AnimalProfile | null = useMemo(() => {
    if (!current || !currentTrait) return null;
    return {
      species: current.species as SpeciesId,
      traitId: currentTrait.id,
      favoriteCareAction: currentTrait.loves,
    };
  }, [current, currentTrait]);

  /* ------------------------------ care (sanctuary) ------------------------------ */
  const handleCare = (action: CareActionId) => {
    if (!game || !current || game.phase !== 'caring') return;
    const stage = stageRef.current;
    stage?.react(action);
    stage?.wake();

    // Phase 2: the tap is also a sim intent (§3.5) — autonomy yields,
    // the need refill lands instantly with the hearts/coins below, and
    // commit() syncs the sim's needs into the same document write.
    if (simRef.current && simForRef.current === current.instanceId) {
      simRef.current.applyCare(action);
    }

    const isFav = !!currentTrait && currentTrait.loves === action;
    const bonus = isFav && bonusAvailable;
    const heartsGain = bonus ? 2 : 1;
    const newHearts = Math.min(8, current.hearts + heartsGain);

    // Speech (§B3.1): favourite → trait lines, alternating; a matching
    // contrasting line at most once per rescue; otherwise the generic pool,
    // picked the original way: (hearts + action length) % pool size.
    let line: string;
    if (isFav && currentTrait) {
      line = currentTrait.favLines[favLineIdx.current % 2];
      favLineIdx.current += 1;
    } else if (
      currentTrait &&
      currentTrait.otherLine.action === action &&
      otherLineUsedFor.current !== current.instanceId
    ) {
      line = currentTrait.otherLine.text;
      otherLineUsedFor.current = current.instanceId;
    } else {
      const pool = GENERIC_LINES[action];
      line = pool[(current.hearts + action.length) % pool.length];
    }
    stage?.say(line);
    stage?.floatEmojis(bonus ? ['❤️', '✨', '🪙'] : ['❤️', '🪙']);

    // Sound: the care action, the heart ladder for each heart just filled
    // (the bonus heart gets the octave shimmer), and the throttled coin tick.
    Snd.play(`care.${action}`, { species: current.species, favourite: isFav });
    for (let k = 0; k < heartsGain; k++) {
      Snd.play('heart.fill', {
        noteIndex: current.hearts + k,
        favourite: bonus && k === heartsGain - 1,
        delay: 0.12 + k * 0.1,
      });
    }
    Snd.play('coin.earn');

    const next: GameState = {
      ...game,
      coins: game.coins + 2,
      current: {
        ...current,
        hearts: newHearts,
        favBonusCount: bonus ? current.favBonusCount + 1 : current.favBonusCount,
        favBonusLastDate: bonus ? todayLocal() : current.favBonusLastDate,
      },
    };

    if (newHearts >= 8 && profile) {
      // Flow C, commit 1 (audit F7): freeze the offer, flip the phase.
      // No album entry, no +30 yet.
      const offer = generateOffer(profile, game.adopterCooldowns, game.lastOfferIds);
      next.phase = 'celebration';
      next.pendingAdoption = {
        animalSnapshot: {
          name: current.name,
          species: current.species,
          traitId: current.traitId,
          favoriteCareAction: profile.favoriteCareAction,
          outfit: current.outfit,
        },
        offerIds: offer.offerIds,
        pickId: offer.pickId,
      };
    }
    commit(next);
  };

  /* ------------------------------ adoption (card tap) ------------------------------ */
  const handleChooseAdopter = (adopterId: string) => {
    if (!game || !current || !game.pendingAdoption || !profile) return;
    const pending = game.pendingAdoption;
    const adopter = ADOPTERS_BY_ID[adopterId];
    if (!adopter) return;
    const trioScores: Record<string, number> = {};
    for (const id of pending.offerIds) {
      trioScores[id] = scoreAdopter(profile, ADOPTERS_BY_ID[id]).total;
    }
    const chosenScore = trioScores[adopterId] ?? 0;
    const badge = isPerfectMatch(adopterId, trioScores);
    const story = generateStory(
      {
        name: pending.animalSnapshot.name,
        species: pending.animalSnapshot.species as SpeciesId,
        traitId: (pending.animalSnapshot.traitId ?? 'gentle') as TraitId,
        favoriteCareAction: profile.favoriteCareAction,
      },
      adopter,
      {
        badge,
        hasAffinity: chosenScore > 0,
        lastTemplateIds: game.lastStoryTemplateIds,
      },
    );
    const entry: AlbumEntry = {
      id: `adopted-${Date.now()}`,
      name: pending.animalSnapshot.name,
      species: pending.animalSnapshot.species,
      outfit: pending.animalSnapshot.outfit,
      story: story.story,
      instanceId: current.instanceId,
      traitId: pending.animalSnapshot.traitId,
      favoriteCareAction: profile.favoriteCareAction,
      adopterId: adopter.id,
      adopterName: adopter.name,
      adopterHome: adopter.home,
      adopterHomeShort: adopter.homeShort,
      homeTheme: adopter.homeTheme,
      matchBadge: badge,
      matchScore: chosenScore,
      storySummary: story.summary,
    };
    Snd.play('coin.cascade', { delay: 0.05 });
    if (badge) Snd.play('celebrate.perfect', { delay: 0.2 });
    commit({
      ...game,
      coins: game.coins + 30,
      adoptedCount: game.adoptedCount + 1,
      album: [...game.album, entry],
      pendingAdoption: null,
      adopterCooldowns: applyAdoptionCooldowns(game.adopterCooldowns, adopterId),
      lastOfferIds: pending.offerIds,
      lastStoryTemplateIds: story.templateIds,
    });
  };

  const handleNextRescue = () => {
    if (!game || game.pendingAdoption) return;
    const nextIdx = (game.rotationIndex + 1) % ROSTER_ORDER.length;
    const arrivalIndex = game.arrivalIndex + 1;
    const rescue = makeRescue(
      nextIdx,
      game.rngSeed,
      arrivalIndex,
      (current?.traitId as TraitId | null) ?? null,
    );
    favLineIdx.current = 0;
    Snd.play('arrive', { species: rescue.species, delay: 0.05 });
    commit({
      ...game,
      rotationIndex: nextIdx,
      arrivalIndex,
      phase: 'caring',
      current: rescue,
    });
  };

  /* ------------------------------ shop ------------------------------ */
  const handleBuy = (outfitId: OutfitId, price: number) => {
    if (!game || game.ownedItems.includes(outfitId)) return;
    if (game.coins < price) {
      // no error sound exists in this game — a warm "not yet" shrug (§2.4)
      Snd.play('shop.notyet');
      return;
    }
    Snd.play('shop.buy');
    commit({ ...game, coins: game.coins - price, ownedItems: [...game.ownedItems, outfitId] });
  };
  const handleWear = (outfitId: OutfitId) => {
    if (!game || !current) return;
    const equipping = current.outfit !== outfitId;
    if (equipping) Snd.play('shop.equip', { species: current.species });
    else Snd.play('ui.tap');
    commit({
      ...game,
      current: { ...current, outfit: current.outfit === outfitId ? null : outfitId },
    });
  };

  /* ------------------------------ visit care: affection only ------------------------------ */
  const handleVisitCare = (entry: AlbumEntry) => (action: CareActionId) => {
    const stage = visitStageRef.current;
    stage?.react(action);
    const trait =
      entry.traitId && entry.traitId in TRAITS ? TRAITS[entry.traitId as TraitId] : null;
    let line: string;
    if (trait && trait.loves === action) {
      line = trait.favLines[Math.floor(Math.random() * 2)];
    } else {
      const pool = GENERIC_LINES[action];
      line = pool[Math.floor(Math.random() * pool.length)];
    }
    stage?.say(line);
    stage?.floatEmojis(['💗']);
    // visits are a quieter room than the yard: same care sounds at −2 dB (§1.2 row 27)
    Snd.play(`care.${action}`, {
      species: entry.species,
      favourite: !!trait && trait.loves === action,
      gain: 0.79,
    });
  };

  /* ------------------------------ reset / import ------------------------------ */
  const handleFreshStart = () => {
    // Fresh Start does NOT reset audio prefs (§8.3) — they ride along.
    Snd.play('ui.close'); // a door closing gently — no dramatic sting (§1.3)
    const fresh: GameState = { ...freshState(), settings: { audio: Snd.getPrefs() } };
    // The old resident's sim must not leak into the new sanctuary (its
    // first rescue reuses instanceId 'arr-1'): drop it before committing.
    simRef.current = null;
    simForRef.current = null;
    setSimView(null);
    setSimEpoch((e) => e + 1);
    setView({ kind: 'sanctuary' });
    setConfirmReset(false);
    setLoadIssue(null);
    commit(fresh);
    try {
      saveSave(STORAGE, fresh);
    } catch {
      /* noop */
    }
  };

  const handleImport = (text: string) => {
    const result = parseImport(text);
    if (result.status === 'ok') {
      setLoadIssue(null);
      setImportMsg(null);
      setView({ kind: 'sanctuary' });
      const prefs = audioPrefsOf(result.state);
      setAudioPrefs(prefs);
      Snd.loadPrefs(prefs, result.state.rngSeed);
      // Same rule as Fresh Start: the replaced sanctuary gets a fresh sim.
      simRef.current = null;
      simForRef.current = null;
      setSimView(null);
      setSimEpoch((e) => e + 1);
      const caught = withLoadCatchUp(result.state);
      commit(caught);
      try {
        saveSave(STORAGE, caught);
      } catch {
        /* noop */
      }
    } else if (result.status === 'future') {
      setImportMsg('That backup is from a newer version of the game.');
    } else {
      setImportMsg("That doesn't look like a sanctuary backup.");
    }
  };

  /* ------------------------------ render ------------------------------ */
  if (typeof window !== 'undefined' && window.location.hash === '#lab') {
    return <SoundLab />;
  }

  if (loadIssue) {
    return (
      <Shell>
        <div className="rounded-3xl bg-white/90 border border-amber-200 p-6 shadow-sm animate-pop-in">
          <h1 className="text-2xl font-bold mb-2">🐾 Animal Sanctuary</h1>
          <p className="text-stone-700 mb-4">
            {loadIssue === 'future'
              ? 'This sanctuary was saved by a newer version of the game, so this version will not change it.'
              : "Your saved sanctuary couldn't be read. It has NOT been changed or erased — it is still saved exactly as it was."}
          </p>
          <p className="text-stone-700 mb-3 font-semibold">Restore from a backup:</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-stone-300 p-3 text-sm mb-3"
            placeholder="Paste a backup here…"
          />
          {importMsg && <p className="text-red-700 text-sm mb-3">{importMsg}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleImport(importText)}
              className="rounded-full bg-amber-400 hover:bg-amber-300 font-bold px-5 py-2.5 shadow"
            >
              Import backup
            </button>
            <button
              type="button"
              onClick={handleFreshStart}
              className="rounded-full bg-stone-100 hover:bg-stone-200 font-semibold px-5 py-2.5"
            >
              Start a new sanctuary
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (!game || !current) {
    return (
      <Shell>
        <p className="text-center text-lg font-semibold py-16">Opening the sanctuary… 🐾</p>
      </Shell>
    );
  }

  const lastAdopted = game.album[game.album.length - 1] as AlbumEntry | undefined;
  const visitEntry =
    view.kind === 'visit' ? game.album.find((e) => e.id === view.entryId) : undefined;

  /* Phase 2 yard view state: the sim snapshot for THIS resident (a stale
   * snapshot from a previous resident is never rendered). */
  const simForCurrent = !!simView && simView.instanceId === current.instanceId;
  const walkerX = simForCurrent ? simView.x : 50;
  const walkerY = simForCurrent ? simView.y : 55;
  const simSleep: SleepState | undefined = !simForCurrent
    ? undefined
    : simView.mode === 'acting' && simView.action?.defId === 'bed'
      ? 'asleep'
      : simView.mode === 'acting' && simView.action?.defId === 'cuddle-rug'
        ? 'sleepy'
        : 'awake';

  return (
    <Shell>
      <header className="relative flex items-center justify-between mb-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">🐾 Animal Sanctuary</h1>
        <div className="flex items-center gap-2">
          {/* Sound controls — top bar, first viewport, one tap to silence
              (SOUND-DESIGN-DEEP-DIVE §5.5.2). Stored mute is sacred. */}
          <div className="flex items-center rounded-full bg-white/90 border border-amber-200 shadow-sm">
            <button
              type="button"
              onClick={() => Snd.setMuted(!audioPrefs.muted)}
              aria-label={audioPrefs.muted ? 'Sound is off — tap to turn sound on' : 'Sound is on — tap to mute'}
              className="w-11 h-11 rounded-full text-xl leading-none"
            >
              {audioPrefs.muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={() => setSoundPop((v) => !v)}
              aria-label="Volume"
              aria-expanded={soundPop}
              className="w-7 h-11 rounded-full text-xs text-stone-500"
            >
              ▾
            </button>
          </div>
          <div className="rounded-full bg-white/90 border border-amber-200 px-4 py-1.5 font-bold shadow-sm" aria-label={`${game.coins} coins`}>
            🪙 {game.coins}
          </div>
        </div>
        {soundPop && (
          <div className="absolute right-0 top-12 z-20 rounded-2xl bg-white border border-amber-200 shadow-lg px-4 py-3 w-60">
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              Volume
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(audioPrefs.volume * 100)}
                onChange={(e) => Snd.setVolume(Number(e.target.value) / 100)}
                className="flex-1 accent-amber-500"
                aria-label="Volume"
              />
              <span className="w-9 text-right">{Math.round(audioPrefs.volume * 100)}%</span>
            </label>
            <p className="text-xs text-stone-400 mt-1.5">Sound settings are remembered on this device.</p>
          </div>
        )}
      </header>

      {view.kind === 'sanctuary' && (
        <>
          <section className="relative rounded-3xl bg-gradient-to-b from-sky-200 via-green-100 to-green-200 border border-green-200 shadow-sm px-4 pt-10 pb-4 overflow-hidden">
            {/* Phase 2 yard: advertiser props at their sim anchors, and
                the resident walking between them (the walker is an HTML
                wrapper — the rig's transforms are never touched). */}
            <div className="relative mx-auto w-full max-w-[540px] h-[430px]" data-yard>
              {YARD_LAYOUT.map((inst) => (
                <div
                  key={inst.key}
                  className="absolute w-[84px]"
                  style={{
                    left: `${inst.x}%`,
                    top: `${inst.y}%`,
                    transform: 'translate(-50%, -82%)',
                  }}
                  data-prop={inst.def.id}
                >
                  <YardProp defId={inst.def.id} />
                </div>
              ))}
              <div
                className="yard-walker absolute w-[36%]"
                style={{
                  left: `${walkerX}%`,
                  top: `${walkerY}%`,
                  transform: 'translate(-50%, -84%)',
                }}
              >
                <AnimalStage
                  key={current.instanceId}
                  ref={stageRef}
                  species={current.species as SpeciesId}
                  outfit={current.outfit}
                  instanceId={current.instanceId}
                  traitId={current.traitId}
                  idle
                  initialLine={currentTrait ? currentTrait.kidLine : null}
                  sleepOverride={simSleep}
                />
                {simForCurrent && simView.thought && (
                  <div
                    className="absolute -top-2 right-0 z-20 rounded-full bg-white border border-amber-200 shadow px-2 py-1 text-lg animate-pop-in"
                    data-thought={simView.thought}
                    aria-hidden
                  >
                    {NEED_ICONS[simView.thought]}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-3xl bg-white/90 border border-amber-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <input
                value={current.name}
                onChange={(e) => commit({ ...game, current: { ...current, name: e.target.value } })}
                aria-label="Rescue's name"
                className="text-2xl font-bold bg-transparent border-b-2 border-dashed border-amber-300 focus:border-amber-500 outline-none w-44"
              />
              <span className="text-lg tracking-tight" aria-label={`${current.hearts} of 8 hearts`}>
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i}>{i < current.hearts ? '❤️' : '🤍'}</span>
                ))}
              </span>
              <TraitChip traitId={current.traitId} />
            </div>

            {game.phase === 'caring' && (
              <div className="grid grid-cols-5 gap-2 mt-4">
                {CARE_ACTION_LIST.map((a) => {
                  const isFav = currentTrait?.loves === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleCare(a.id)}
                      className="relative rounded-2xl bg-amber-100 hover:bg-amber-200 active:scale-95 transition border border-amber-200 py-2.5 font-bold text-sm sm:text-base"
                    >
                      {isFav && (
                        <span
                          className={`absolute -top-2 -right-1 text-base ${bonusAvailable ? 'animate-twinkle' : ''}`}
                          aria-label="Favourite!"
                        >
                          ✨
                        </span>
                      )}
                      <span className="block text-2xl" aria-hidden>{a.icon}</span>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {game.phase === 'celebration' && (
            <section ref={celebrationRef} className="mt-3 rounded-3xl bg-white/95 border-2 border-amber-300 p-4 shadow-md animate-pop-in">
              {game.pendingAdoption ? (
                <>
                  <h2 className="text-xl font-extrabold text-center">
                    {current.name} is ready for a forever home! 💛
                  </h2>
                  <p className="text-center text-stone-600 mt-1 mb-4">
                    Who will {current.name} live with? ✨ Sanctuary's Pick is our suggestion — every home is a happy home.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {game.pendingAdoption.offerIds.map((id) => {
                      const adopter = ADOPTERS_BY_ID[id];
                      return (
                        <AdopterCard
                          key={id}
                          adopter={adopter}
                          isPick={id === game.pendingAdoption!.pickId}
                          hint={profile ? hintFor(profile, adopter) : null}
                          onPick={() => handleChooseAdopter(id)}
                        />
                      );
                    })}
                  </div>
                </>
              ) : lastAdopted ? (
                <div className="text-center">
                  <div className="text-3xl mb-1" aria-hidden>🎉💛🎉</div>
                  <h2 className="text-xl font-extrabold">
                    {lastAdopted.name} found a forever home!
                  </h2>
                  {lastAdopted.matchBadge && (
                    <span className="inline-block mt-2 rounded-full bg-amber-400 text-amber-950 text-sm font-bold px-3 py-1">
                      Perfect Match! 💛
                    </span>
                  )}
                  <p className="mt-3 text-stone-700 leading-relaxed max-w-prose mx-auto">{lastAdopted.story}</p>
                  <div className="flex flex-wrap justify-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        Snd.play('visit.greet', { species: lastAdopted.species, homeRoot: homeRootOf(lastAdopted.adopterId) });
                        setView({ kind: 'visit', entryId: lastAdopted.id });
                      }}
                      className="rounded-full bg-amber-400 hover:bg-amber-300 font-bold px-5 py-2.5 shadow"
                    >
                      Visit {lastAdopted.name} 💛
                    </button>
                    <button
                      type="button"
                      onClick={handleNextRescue}
                      className="rounded-full bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 shadow"
                    >
                      Meet the next rescue →
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          <section className="mt-3 rounded-3xl bg-white/90 border border-amber-200 p-4 shadow-sm">
            <h2 className="text-lg font-extrabold mb-1">🌹 Rose's Shop</h2>
            <p className="text-sm text-stone-500 mb-3">Pretty things for your rescue. Care taps earn 🪙 2 each!</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {OUTFITS.map((o) => {
                const owned = game.ownedItems.includes(o.id);
                const worn = current.outfit === o.id;
                return (
                  <div key={o.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-center">
                    <div className="text-3xl" aria-hidden>{o.icon}</div>
                    <div className="font-bold text-sm mt-1">{o.name}</div>
                    {owned ? (
                      <button
                        type="button"
                        onClick={() => handleWear(o.id)}
                        className={`mt-2 rounded-full px-3.5 py-1.5 text-sm font-bold ${worn ? 'bg-green-500 text-white' : 'bg-amber-200 hover:bg-amber-300'}`}
                      >
                        {worn ? 'Wearing ✓' : 'Wear'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBuy(o.id, o.price)}
                        aria-disabled={game.coins < o.price}
                        className={`mt-2 rounded-full bg-amber-400 hover:bg-amber-300 px-3.5 py-1.5 text-sm font-bold ${game.coins < o.price ? 'opacity-50' : ''}`}
                      >
                        🪙 {o.price}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              Snd.play('album.open');
              setView({ kind: 'album' });
            }}
            className="mt-3 w-full rounded-3xl bg-indigo-100 hover:bg-indigo-200 border border-indigo-200 p-4 font-extrabold text-lg shadow-sm"
          >
            📖 Adoption Album ({game.album.length})
          </button>
        </>
      )}

      {view.kind === 'album' && (
        <section className="rounded-3xl bg-white/90 border border-amber-200 p-4 shadow-sm animate-pop-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-extrabold">📖 Adoption Album</h2>
            <button type="button" onClick={() => { Snd.play('ui.close'); setView({ kind: 'sanctuary' }); }} className="rounded-full bg-amber-200 hover:bg-amber-300 font-bold px-4 py-1.5">
              ← Back
            </button>
          </div>
          {game.album.length === 0 ? (
            <p className="text-stone-600 py-6 text-center">No adoptions yet. Your first friend is waiting in the yard! 🐾</p>
          ) : (
            <ul className="space-y-3">
              {game.album.map((entry) => (
                <li key={entry.id} className="flex gap-3 items-center rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <div className="w-20 shrink-0">
                    <AnimalSvg species={entry.species as SpeciesId} outfit={entry.outfit} title={entry.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{entry.name}</span>
                      <TraitChip traitId={entry.traitId} size="sm" />
                      {entry.matchBadge && (
                        <span className="rounded-full bg-amber-400 text-amber-950 text-xs font-bold px-2 py-0.5">Perfect Match! 💛</span>
                      )}
                    </div>
                    <p className="text-sm text-stone-600 mt-0.5">{entry.storySummary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      Snd.play('visit.greet', { species: entry.species, homeRoot: homeRootOf(entry.adopterId) });
                      setView({ kind: 'visit', entryId: entry.id });
                    }}
                    className="shrink-0 rounded-full bg-amber-400 hover:bg-amber-300 font-bold px-4 py-2 shadow-sm"
                  >
                    Visit 💛
                  </button>
                </li>
              ))}
            </ul>
          )}
          <BackupCorner game={game} onImport={handleImport} />
        </section>
      )}

      {view.kind === 'visit' && visitEntry && (
        <VisitView
          entry={visitEntry}
          stageRef={visitStageRef}
          onBack={() => { Snd.play('ui.close'); setView({ kind: 'album' }); }}
          onCare={handleVisitCare(visitEntry)}
        />
      )}
      {view.kind === 'visit' && !visitEntry && (
        <section className="rounded-3xl bg-white/90 border border-amber-200 p-6 text-center">
          <p className="mb-4">That friend couldn't be found.</p>
          <button type="button" onClick={() => { Snd.play('ui.close'); setView({ kind: 'album' }); }} className="rounded-full bg-amber-200 font-bold px-4 py-2">← Album</button>
        </section>
      )}

      <footer className="mt-6 mb-2 text-center">
        {confirmReset ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="font-semibold text-stone-700">Start over? The whole sanctuary will be new.</span>
            <button type="button" onClick={handleFreshStart} className="rounded-full bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3.5 py-1.5">Yes, fresh start</button>
            <button type="button" onClick={() => { Snd.play('ui.tap'); setConfirmReset(false); }} className="rounded-full bg-stone-100 hover:bg-stone-200 font-bold px-3.5 py-1.5">Keep playing</button>
          </span>
        ) : (
          <button type="button" onClick={() => { Snd.play('ui.tap'); setConfirmReset(true); }} className="text-sm text-stone-400 hover:text-stone-600 underline">
            Fresh Start
          </button>
        )}
      </footer>

      {DEBUG && simView && (
        <div
          className="fixed left-2 bottom-2 z-50 rounded-xl bg-white/95 border border-stone-300 shadow px-3 py-2 text-[11px] font-mono leading-relaxed text-stone-700"
          data-testid="yard-debug"
        >
          <div>
            ⏱ {simView.time.toFixed(1)}s · {simView.mode}
            {simView.action
              ? ` · ${simView.action.phase} → ${simView.action.defId}`
              : ''}{' '}
            · decisions {simView.decisionCount}
          </div>
          <div>
            🍖 {simView.needs.tummy.toFixed(1)} · 💤 {simView.needs.energy.toFixed(1)} · 🫧{' '}
            {simView.needs.clean.toFixed(1)} · 🎾 {simView.needs.fun.toFixed(1)} · ❤️{' '}
            {simView.needs.affection.toFixed(1)}
          </div>
          <div>
            top:{' '}
            {simView.topScores.map((s) => `${s.id} ${s.score.toFixed(2)}`).join(' · ') ||
              '—'}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-green-50 px-3 py-4 sm:px-6">
      <div className="max-w-3xl mx-auto">{children}</div>
    </main>
  );
}

/* ------------------------------ visit view ------------------------------ */

function VisitView({
  entry,
  stageRef,
  onBack,
  onCare,
}: {
  entry: AlbumEntry;
  stageRef: React.RefObject<StageHandle | null>;
  onBack: () => void;
  onCare: (action: CareActionId) => void;
}) {
  const adopter = entry.adopterId ? ADOPTERS_BY_ID[entry.adopterId] : null;
  const theme = HOME_THEMES[entry.homeTheme] ?? HOME_THEMES.cozy;
  return (
    <section className="animate-pop-in">
      <div className={`relative rounded-3xl bg-gradient-to-b ${theme.sky} border border-amber-200 shadow-sm px-4 pt-12 pb-4 overflow-hidden`}>
        {adopter && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full bg-white/90 border border-amber-200 pl-1 pr-3.5 py-1 shadow-sm">
            <Medallion adopter={adopter} size={34} />
            <span className="text-sm font-bold leading-tight">
              {adopter.name}
              <span className="block text-xs font-medium text-stone-500">{entry.adopterHomeShort}</span>
            </span>
          </div>
        )}
        <span className="absolute right-4 top-3 text-2xl" aria-hidden>{theme.props[1]}</span>
        <span className="absolute left-4 bottom-3 text-2xl" aria-hidden>{theme.props[0]}</span>
        <span className="absolute right-6 bottom-3 text-2xl" aria-hidden>{theme.props[2]}</span>
        <div className="max-w-sm mx-auto">
          <AnimalStage
            key={entry.instanceId}
            ref={stageRef}
            species={entry.species as SpeciesId}
            outfit={entry.outfit}
            instanceId={entry.instanceId}
            traitId={entry.traitId}
            idle
          />
        </div>
      </div>

      <div className="mt-3 rounded-3xl bg-white/90 border border-amber-200 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold flex flex-wrap items-center gap-2">
              {entry.name} <TraitChip traitId={entry.traitId} size="sm" />
              {entry.matchBadge && (
                <span className="rounded-full bg-amber-400 text-amber-950 text-xs font-bold px-2 py-0.5">Perfect Match! 💛</span>
              )}
            </h2>
            <p className="text-stone-600 mt-0.5">{entry.storySummary} 💛</p>
          </div>
          <button type="button" onClick={onBack} className="shrink-0 rounded-full bg-amber-200 hover:bg-amber-300 font-bold px-4 py-1.5">
            ← Album
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2 mt-4">
          {CARE_ACTION_LIST.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onCare(a.id)}
              className="rounded-2xl bg-rose-100 hover:bg-rose-200 active:scale-95 transition border border-rose-200 py-2.5 font-bold text-sm sm:text-base"
            >
              <span className="block text-2xl" aria-hidden>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-2 text-center">Visits are just for love — no hearts or coins here. 💛</p>
        <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 p-3.5">
          <h3 className="font-bold text-sm mb-1">📖 {entry.name}'s adoption story</h3>
          <p className="text-stone-700 leading-relaxed">{entry.story}</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ backup corner (album footer) ------------------------------ */

function BackupCorner({
  game,
  onImport,
}: {
  game: GameState;
  onImport: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const exportText = useMemo(() => serializeExport(game), [game]);

  const download = () => {
    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animal-sanctuary-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-5 border-t border-stone-200 pt-4">
      <button
        type="button"
        onClick={() => { Snd.play('ui.tap'); setOpen(!open); }}
        className="font-bold text-stone-600 hover:text-stone-800"
        aria-expanded={open}
      >
        🛟 Backup {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-3 animate-pop-in">
          <p className="text-sm text-stone-600 mb-2">
            A backup keeps your sanctuary safe forever — even on a new iPad. Save the file, or copy the text somewhere safe.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={download} className="rounded-full bg-amber-400 hover:bg-amber-300 font-bold px-4 py-2 text-sm shadow-sm">
              ⬇️ Download backup
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(exportText);
                setCopied(true);
              }}
              className="rounded-full bg-stone-100 hover:bg-stone-200 font-bold px-4 py-2 text-sm"
            >
              {copied ? 'Copied ✓' : '📋 Copy backup text'}
            </button>
          </div>
          <details>
            <summary className="text-sm font-semibold text-stone-500 cursor-pointer">Restore a backup instead</summary>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-stone-300 p-3 text-sm mt-2"
              placeholder="Paste a backup here…"
            />
            {msg && <p className="text-sm mt-1 text-stone-600">{msg}</p>}
            <button
              type="button"
              onClick={() => {
                const result = parseImport(text);
                if (result.status === 'ok') {
                  if (window.confirm('Replace this sanctuary with the backup?')) {
                    onImport(text);
                  }
                } else {
                  setMsg(
                    result.status === 'future'
                      ? 'That backup is from a newer version of the game.'
                      : "That doesn't look like a sanctuary backup.",
                  );
                }
              }}
              className="mt-2 rounded-full bg-red-100 hover:bg-red-200 text-red-800 font-bold px-4 py-2 text-sm"
            >
              Replace sanctuary with this backup
            </button>
          </details>
        </div>
      )}
    </div>
  );
}
