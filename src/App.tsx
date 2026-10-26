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
import { OUTFITS, AnimalSvg, type OutfitId } from './game/animals';
import { ADOPTERS_BY_ID } from './game/adopters';
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
  };
}

type View = { kind: 'sanctuary' } | { kind: 'album' } | { kind: 'visit'; entryId: string };

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loadIssue, setLoadIssue] = useState<'corrupt' | 'future' | null>(null);
  const [view, setView] = useState<View>({ kind: 'sanctuary' });
  const [confirmReset, setConfirmReset] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const stageRef = useRef<StageHandle | null>(null);
  const visitStageRef = useRef<StageHandle | null>(null);
  const celebrationRef = useRef<HTMLDivElement | null>(null);
  const favLineIdx = useRef(0);
  const otherLineUsedFor = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const gameRef = useRef<GameState | null>(null);
  gameRef.current = game;

  /* ---------- load once: migrate in memory BEFORE any write (F1 fencing) */
  useEffect(() => {
    const result = loadSave(STORAGE);
    if (result.status === 'ok') {
      setGame(result.state);
      if (result.migratedFrom < CURRENT_SAVE_VERSION) {
        try {
          saveSave(STORAGE, result.state);
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

  /* ---------- commit: set state + debounced whole-document write */
  const commit = useCallback((next: GameState) => {
    setGame(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        saveSave(STORAGE, next);
      } catch {
        /* state stays in memory; a later commit retries */
      }
    }, 300);
  }, []);

  /* flush the pending write when the page goes away */
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      if (gameRef.current) {
        try {
          saveSave(STORAGE, gameRef.current);
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

  /* bring the celebration into view when the phase flips (audit F3/C3) */
  useEffect(() => {
    if (game?.phase === 'celebration') {
      celebrationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [game?.phase]);

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
    if (!game || game.ownedItems.includes(outfitId) || game.coins < price) return;
    commit({ ...game, coins: game.coins - price, ownedItems: [...game.ownedItems, outfitId] });
  };
  const handleWear = (outfitId: OutfitId) => {
    if (!game || !current) return;
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
  };

  /* ------------------------------ reset / import ------------------------------ */
  const handleFreshStart = () => {
    const fresh = freshState();
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
      commit(result.state);
      try {
        saveSave(STORAGE, result.state);
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

  return (
    <Shell>
      <header className="flex items-center justify-between mb-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">🐾 Animal Sanctuary</h1>
        <div className="rounded-full bg-white/90 border border-amber-200 px-4 py-1.5 font-bold shadow-sm" aria-label={`${game.coins} coins`}>
          🪙 {game.coins}
        </div>
      </header>

      {view.kind === 'sanctuary' && (
        <>
          <section className="relative rounded-3xl bg-gradient-to-b from-sky-200 via-green-100 to-green-200 border border-green-200 shadow-sm px-4 pt-12 pb-4 overflow-hidden">
            <div className="max-w-sm mx-auto">
              <AnimalStage
                key={current.instanceId}
                ref={stageRef}
                species={current.species as SpeciesId}
                outfit={current.outfit}
                instanceId={current.instanceId}
                traitId={current.traitId}
                idle
                initialLine={currentTrait ? currentTrait.kidLine : null}
              />
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
                      onClick={() => setView({ kind: 'visit', entryId: lastAdopted.id })}
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
                        disabled={game.coins < o.price}
                        className="mt-2 rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 px-3.5 py-1.5 text-sm font-bold"
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
            onClick={() => setView({ kind: 'album' })}
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
            <button type="button" onClick={() => setView({ kind: 'sanctuary' })} className="rounded-full bg-amber-200 hover:bg-amber-300 font-bold px-4 py-1.5">
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
                    onClick={() => setView({ kind: 'visit', entryId: entry.id })}
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
          onBack={() => setView({ kind: 'album' })}
          onCare={handleVisitCare(visitEntry)}
        />
      )}
      {view.kind === 'visit' && !visitEntry && (
        <section className="rounded-3xl bg-white/90 border border-amber-200 p-6 text-center">
          <p className="mb-4">That friend couldn't be found.</p>
          <button type="button" onClick={() => setView({ kind: 'album' })} className="rounded-full bg-amber-200 font-bold px-4 py-2">← Album</button>
        </section>
      )}

      <footer className="mt-6 mb-2 text-center">
        {confirmReset ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="font-semibold text-stone-700">Start over? The whole sanctuary will be new.</span>
            <button type="button" onClick={handleFreshStart} className="rounded-full bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3.5 py-1.5">Yes, fresh start</button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-full bg-stone-100 hover:bg-stone-200 font-bold px-3.5 py-1.5">Keep playing</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className="text-sm text-stone-400 hover:text-stone-600 underline">
            Fresh Start
          </button>
        )}
      </footer>
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
        onClick={() => setOpen(!open)}
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
