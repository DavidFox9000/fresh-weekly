import { Link } from "react-router-dom";
import { buttonGhost, buttonPrimary, panelBase } from "../lib/styles";

type HomeProps = {
  isAuthed: boolean;
  onLogin: () => void;
};

const Home = ({ isAuthed, onLogin }: HomeProps) => {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-900 dark:text-slate-300">
          Fresh Weekly Builder
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-black dark:text-white sm:text-5xl">
          Re-roll your taste on demand.
        </h1>
        <p className="mt-4 max-w-xl text-base text-slate-900 dark:text-slate-300">
          Pick a playlist you actually love, bias the artist mix, and spin up a
          new set of 30 tracks that feels like your real Discover Weekly.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {isAuthed ? (
            <Link className={buttonPrimary} to="/generator">
              Generate a playlist
            </Link>
          ) : (
            <button className={buttonPrimary} onClick={onLogin}>
              Connect Spotify
            </button>
          )}
          <Link className={buttonGhost} to="/generator">
            See the flow
          </Link>
        </div>
      </div>
      <div className={`${panelBase} p-6`}>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:border-emerald-900/60 dark:bg-slate-900/70 dark:text-slate-300">
            Bias-aware mix
          </span>
          <span className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:border-emerald-900/60 dark:bg-slate-900/50 dark:text-slate-300">
            30 tracks
          </span>
        </div>
        <ul className="mt-6 space-y-3 text-sm text-slate-800 dark:text-slate-300">
          <li>We sample your playlist's most-played artists.</li>
          <li>We pull tracks from their albums and nearby playlists.</li>
          <li>We cap repeats and keep it fresh.</li>
        </ul>
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-200/60 pt-6 dark:border-emerald-900/60">
          <div>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
              3-4x
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              faster than waiting
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
              100%
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              your taste bias
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Home;
