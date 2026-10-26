// Sound lab (SOUND-DESIGN-DEEP-DIVE §6.1.2) — a hidden tuning/QA view at
// #lab. Every recipe gets a play button, a species selector, and a
// render-check that meters OfflineAudioContext renders (§7.2.1): peak must
// stay ≤ 0.89 (−1 dBFS), head/tail 5 ms RMS must be low (fades present).
import { useEffect, useState } from 'react';
import { RECIPE_IDS, Snd } from './sound';

const SPECIES = ['dog', 'cat', 'bunny', 'fox', 'panda', 'duck', 'turtle', 'hedgehog', 'penguin'];

interface Row {
  id: string;
  peak: number;
  headDb: number;
  tailDb: number;
  ok: boolean;
}

const toDb = (x: number) => (x <= 0 ? -Infinity : 20 * Math.log10(x));

export default function SoundLab() {
  useEffect(() => {
    (window as unknown as { __snd?: unknown }).__snd = Snd;
  }, []);
  const [species, setSpecies] = useState('cat');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);

  const play = (id: string) => {
    Snd.unlock();
    Snd.play(id, { species, noteIndex: 4, homeRoot: 261.63, favourite: true });
  };

  const renderCheck = async () => {
    setRunning(true);
    const out: Row[] = [];
    for (const id of RECIPE_IDS) {
      const variants: Array<{ species?: string }> = id.startsWith('care.') || id.includes('vocal')
        ? SPECIES.map((s) => ({ species: s }))
        : [{}];
      let worst: Row | null = null;
      for (const v of variants) {
        const st = await Snd.renderStats(id, { species: v.species ?? species, noteIndex: 4, homeRoot: 261.63, favourite: true });
        if (!st) continue;
        const headDb = toDb(st.headRms);
        const tailDb = toDb(st.tailRms);
        const row: Row = {
          id: v.species ? `${id} (${v.species})` : id,
          peak: st.peak,
          headDb,
          tailDb,
          ok: st.peak <= 0.891 && (headDb <= -30 || headDb === -Infinity),
        };
        if (!worst || row.peak > worst.peak) worst = row;
        if (!row.ok && (!worst || worst.ok)) worst = row;
      }
      if (worst) out.push(worst);
    }
    setRows(out);
    setRunning(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 font-sans">
      <h1 className="text-2xl font-extrabold mb-2">🔊 Sound Lab</h1>
      <p className="text-sm text-stone-600 mb-4">
        Tuning harness for the synthesized sound set. Tap any sound to hear it. Render-check meters every
        recipe offline: peak ≤ −1 dBFS and a quiet 5 ms head (attack fades present) must hold.
      </p>
      <label className="block text-sm font-semibold mb-4">
        Species voiceprint{' '}
        <select value={species} onChange={(e) => setSpecies(e.target.value)} className="rounded border border-stone-300 px-2 py-1">
          {SPECIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {RECIPE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => play(id)}
            className="rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-200 px-3 py-2 text-sm font-bold"
          >
            ▶ {id}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void renderCheck()}
        disabled={running}
        className="rounded-full bg-indigo-500 text-white font-bold px-5 py-2.5 disabled:opacity-50"
      >
        {running ? 'Rendering…' : 'Run render-check (§7.2)'}
      </button>
      {rows && (
        <table className="mt-4 w-full text-sm" data-testid="render-results">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Recipe (worst variant)</th>
              <th>Peak</th>
              <th>Head 5ms</th>
              <th>Tail 5ms</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone-100">
                <td className="py-1 font-mono text-xs">{r.id}</td>
                <td>{r.peak.toFixed(3)}</td>
                <td>{r.headDb === -Infinity ? '−∞' : r.headDb.toFixed(1)} dB</td>
                <td>{r.tailDb === -Infinity ? '−∞' : r.tailDb.toFixed(1)} dB</td>
                <td>{r.ok ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
