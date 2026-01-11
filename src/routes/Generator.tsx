import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addTracksToPlaylist,
  createPlaylist,
  fetchAlbumTracks,
  fetchAllPlaylists,
  fetchArtistAlbums,
  fetchCurrentUser,
  fetchPlaylistTracks,
  replacePlaylistTracks,
  searchPlaylists,
  type SpotifyPlaylist,
  type SpotifyToken,
  type SpotifyTrack,
} from "../lib/spotify";
import { buttonPrimary, inputBase, panelBase } from "../lib/styles";

const SEED_ARTISTS = 8;
const ALBUMS_PER_ARTIST = 4;
const TRACKS_PER_ALBUM = 6;

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const spreadByArtist = (tracks: SpotifyTrack[]) => {
  const buckets = new Map<string, SpotifyTrack[]>();
  tracks.forEach((track) => {
    const primary = track.artists[0];
    if (!primary) return;
    const list = buckets.get(primary.id) ?? [];
    list.push(track);
    buckets.set(primary.id, list);
  });

  const order: SpotifyTrack[] = [];
  let lastArtistId: string | null = null;

  while (buckets.size > 0) {
    const entries = Array.from(buckets.entries()).sort(
      (a, b) => b[1].length - a[1].length
    );
    let pickedIndex = entries.findIndex(
      ([artistId]) => artistId !== lastArtistId
    );
    if (pickedIndex === -1) pickedIndex = 0;
    const [artistId, list] = entries[pickedIndex];
    const next = list.shift();
    if (next) {
      order.push(next);
      lastArtistId = artistId;
    }
    if (!list.length) {
      buckets.delete(artistId);
    } else {
      buckets.set(artistId, list);
    }
  }

  return order;
};

const weightedSample = (
  entries: Array<{ id: string; weight: number }>,
  count: number,
  bias: number
) => {
  const pool = entries.map((entry) => ({
    id: entry.id,
    weight: Math.pow(entry.weight, bias),
  }));
  const picks: string[] = [];

  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    let pickedIndex = 0;
    for (let j = 0; j < pool.length; j += 1) {
      roll -= pool[j].weight;
      if (roll <= 0) {
        pickedIndex = j;
        break;
      }
    }
    picks.push(pool[pickedIndex].id);
    pool.splice(pickedIndex, 1);
  }
  return picks;
};

type GeneratorProps = {
  token: SpotifyToken | null;
  isAuthorizing: boolean;
  onLogin: () => void;
};

const Generator = ({ token, isAuthorizing, onLogin }: GeneratorProps) => {
  const [selectedId, setSelectedId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; name: string } | null>(
    null
  );
  const [biasStrength, setBiasStrength] = useState(1.0);
  const [trackCount, setTrackCount] = useState(30);
  const [playlistName, setPlaylistName] = useState("Fresh Weekly");
  const [maxTracksPerArtist, setMaxTracksPerArtist] = useState(2);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchCurrentUser(token!),
    enabled: !!token,
  });

  const playlistsQuery = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchAllPlaylists(token!),
    enabled: !!token,
  });

  const playlistOptions = useMemo(() => {
    if (!playlistsQuery.data) return [];
    return playlistsQuery.data.map((playlist: SpotifyPlaylist) => ({
      id: playlist.id,
      name: playlist.name,
      total: playlist.tracks.total,
    }));
  }, [playlistsQuery.data]);

  const handleGenerate = async () => {
    if (!token || !meQuery.data || !selectedId) return;
    setError(null);
    setResult(null);
    setIsGenerating(true);

    try {
      setStatus("Pulling tracks from your inspiration playlist...");
      const sourceTracks = await fetchPlaylistTracks(token, selectedId);
      const sourceTrackIds = new Set(sourceTracks.map((track) => track.uri));

      const artistCounts = new Map<string, number>();
      const artistNames = new Map<string, string>();
      sourceTracks.forEach((track) => {
        const primary = track.artists[0];
        if (!primary) return;
        artistCounts.set(primary.id, (artistCounts.get(primary.id) ?? 0) + 1);
        artistNames.set(primary.id, primary.name);
      });

      const artistEntries = Array.from(artistCounts.entries()).map(
        ([id, weight]) => ({ id, weight })
      );

      if (!artistEntries.length) {
        throw new Error("No artists found in that playlist.");
      }

      setStatus("Bias-sampling artists you play the most...");
      const seeds = weightedSample(
        artistEntries,
        Math.min(SEED_ARTISTS, artistEntries.length),
        biasStrength
      );

      setStatus("Collecting albums from your biased artists...");
      const market = meQuery.data.country ?? "US";

      const collectCandidatesFromArtists = async (artistIds: string[]) => {
        const albumLists = await Promise.all(
          artistIds.map((artistId) => fetchArtistAlbums(token, artistId, market))
        );
        const albumIds = shuffle(albumLists.flat().map((album) => album.id));
        const sampledAlbumIds = albumIds.slice(
          0,
          Math.min(albumIds.length, artistIds.length * ALBUMS_PER_ARTIST)
        );
        const albumTracks = await Promise.all(
          sampledAlbumIds.map((albumId) => fetchAlbumTracks(token, albumId))
        );
        return albumTracks.flatMap((tracks) =>
          shuffle(tracks).slice(0, TRACKS_PER_ALBUM)
        );
      };

      const finalTracks: SpotifyTrack[] = [];
      const seenTrackUris = new Set<string>();
      const artistCapCounts = new Map<string, number>();
      const addTracks = (tracks: SpotifyTrack[]) => {
        for (const track of shuffle(tracks)) {
          if (finalTracks.length >= trackCount) break;
          if (!track?.uri) continue;
          if (sourceTrackIds.has(track.uri) || seenTrackUris.has(track.uri)) {
            continue;
          }
          const primary = track.artists[0];
          if (!primary) continue;
          const count = artistCapCounts.get(primary.id) ?? 0;
          if (count >= maxTracksPerArtist) continue;
          artistCapCounts.set(primary.id, count + 1);
          seenTrackUris.add(track.uri);
          finalTracks.push(track);
        }
      };

      const seedCandidates = await collectCandidatesFromArtists(seeds);
      addTracks(seedCandidates);

      if (finalTracks.length < trackCount) {
        setStatus("Scanning playlists for neighboring artists...");
        const seedNames = seeds
          .map((artistId) => artistNames.get(artistId))
          .filter((name): name is string => !!name)
          .map((name) => name.replace(/"/g, "").trim())
          .filter((name) => name.length > 0);
        const playlistResults = await Promise.all(
          seedNames.map((name) => searchPlaylists(token, `artist:"${name}"`, 3))
        );
        const playlistIds = shuffle(
          playlistResults.flat().map((playlist) => playlist.id)
        );
        const playlistTrackBatches = await Promise.all(
          playlistIds.map((playlistId) =>
            fetchPlaylistTracks(token, playlistId, 50)
          )
        );
        const neighborArtists = shuffle(
          playlistTrackBatches
            .flat()
            .flatMap((track) => track.artists)
            .map((artist) => artist.id)
            .filter((artistId) => !seeds.includes(artistId))
        ).filter((artistId, index, all) => all.indexOf(artistId) === index);

        for (
          let i = 0;
          i < neighborArtists.length && finalTracks.length < trackCount;
          i += 3
        ) {
          const chunk = neighborArtists.slice(i, i + 3);
          const moreCandidates = await collectCandidatesFromArtists(chunk);
          addTracks(moreCandidates);
        }
      }

      if (finalTracks.length < trackCount) {
        setStatus("Padding with more artists from your playlist...");
        const remainingArtists = shuffle(
          Array.from(artistCounts.keys()).filter(
            (artistId) => !seeds.includes(artistId)
          )
        );
        for (
          let i = 0;
          i < remainingArtists.length && finalTracks.length < trackCount;
          i += 3
        ) {
          const chunk = remainingArtists.slice(i, i + 3);
          const moreCandidates = await collectCandidatesFromArtists(chunk);
          addTracks(moreCandidates);
        }
      }

      if (!finalTracks.length) {
        throw new Error("No new tracks available after filtering.");
      }

      const orderedTracks = spreadByArtist(finalTracks);

      const name = playlistName.trim() || "Fresh Weekly";
      const existingPlaylist = playlistsQuery.data?.find(
        (playlist) => playlist.name.toLowerCase() === name.toLowerCase()
      );

      if (existingPlaylist) {
        setStatus("Updating your existing playlist...");
      } else {
        setStatus("Creating your playlist on Spotify...");
      }
      const description =
        "Built by Fresh Weekly Builder. Bias-aware picks from your playlist.";
      const uris = orderedTracks.map((track) => track.uri);
      let playlistId = existingPlaylist?.id;

      if (!playlistId) {
        const playlist = await createPlaylist(
          token,
          meQuery.data.id,
          name,
          description,
          true
        );
        playlistId = playlist.id;
      }

      if (!playlistId) {
        throw new Error("Unable to create or find a playlist to update.");
      }

      setStatus("Saving tracks to Spotify...");
      const firstChunk = uris.slice(0, 100);
      await replacePlaylistTracks(token, playlistId, firstChunk);
      for (let i = 100; i < uris.length; i += 100) {
        const chunk = uris.slice(i, i + 100);
        await addTracksToPlaylist(token, playlistId, chunk);
      }

      setResult({ id: playlistId, name });
      setStatus("Done!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStatus(null);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!token) {
    return (
      <section className={`${panelBase} p-6`}>
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold text-black dark:text-white">
            Connect your Spotify account
          </h2>
          <p className="mt-3 text-sm text-slate-900 dark:text-slate-300">
            We need access to your playlists so we can build a fresh weekly mix.
          </p>
          <button className={`${buttonPrimary} mt-6`} onClick={onLogin}>
            {isAuthorizing ? "Opening Spotify..." : "Connect Spotify"}
          </button>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-700 dark:text-slate-400">
            You can revoke access anytime from Spotify account settings.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div className={`${panelBase} p-6`}>
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold text-black dark:text-white">
            Choose an inspiration playlist
          </h2>
          <p className="mt-3 text-sm text-slate-900 dark:text-slate-300">
            We will bias toward artists that appear most in this playlist, then
            pull tracks from their albums, singles, and nearby playlists.
          </p>
          <label className="mt-6 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
            Playlist
            <select
              className={inputBase}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Select a playlist...</option>
              {playlistOptions.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name} ({playlist.total} tracks)
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              Playlist name
              <input
                className={`${inputBase} md:w-64`}
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              Track count
              <input
                className={`${inputBase} md:w-32`}
                type="number"
                min={10}
                max={50}
                value={trackCount}
                onChange={(event) => setTrackCount(Number(event.target.value))}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              Max tracks per artist
              <input
                className={`${inputBase} md:w-32`}
                type="number"
                min={1}
                max={5}
                value={maxTracksPerArtist}
                onChange={(event) =>
                  setMaxTracksPerArtist(Number(event.target.value))
                }
              />
            </label>
          </div>
          <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
            Bias strength
            <input
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-emerald-100 accent-[#1DB954] dark:bg-emerald-900/60"
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={biasStrength}
              onChange={(event) => setBiasStrength(Number(event.target.value))}
            />
            <span className="mt-2 block text-sm text-slate-700 dark:text-slate-200">
              {biasStrength.toFixed(1)}x
            </span>
            <span className="mt-1 block text-xs text-slate-700 dark:text-slate-400">
              Start at 1.0 for balanced variety. Move it higher to lean harder
              into your favorites. Max {maxTracksPerArtist} track(s) per artist.
            </span>
          </label>
          <button
            className={`${buttonPrimary} mt-6`}
            onClick={handleGenerate}
            disabled={!selectedId || isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate playlist"}
          </button>
          {status && (
            <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 dark:border-emerald-900/60 dark:bg-slate-900/60 dark:text-slate-200">
              {status}
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
          {result && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <p>Playlist created: {result.name}</p>
              <a
                className="mt-2 inline-flex text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-200"
                href={`https://open.spotify.com/playlist/${result.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Spotify
              </a>
            </div>
          )}
        </div>
      </div>
      <aside className={`${panelBase} bg-white/70 p-6 dark:bg-slate-900/70`}>
        <div>
          <h3 className="text-xl font-semibold text-black dark:text-white">
            How bias works
          </h3>
          <p className="mt-3 text-sm text-slate-900 dark:text-slate-300">
            We count how often each artist appears in your playlist, then
            sample more from the artists you play the most. Start at 1.0 for
            balanced variety and push it higher to lean harder into your
            favorites. If we need more variety, we scan playlists that feature
            your artists to find neighbors.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-700 dark:border-emerald-900/60 dark:bg-slate-900/70 dark:text-slate-300">
            Bias:{" "}
            {biasStrength <= 1.2
              ? "Balanced mix"
              : biasStrength <= 2
                ? "Favorite-leaning"
                : "Heavy favorite tilt"}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-4 dark:border-emerald-900/60 dark:bg-slate-900/60">
              <p className="text-xl font-semibold text-slate-900 dark:text-white">8</p>
              <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
                seed artists
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-4 dark:border-emerald-900/60 dark:bg-slate-900/60">
              <p className="text-xl font-semibold text-slate-900 dark:text-white">
                {maxTracksPerArtist}
              </p>
              <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
                max per artist
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-4 dark:border-emerald-900/60 dark:bg-slate-900/60">
              <p className="text-xl font-semibold text-slate-900 dark:text-white">
                {trackCount}
              </p>
              <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
                final tracks
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-slate-700 dark:text-slate-400">
            Want more variety? Keep bias near 1.0.
          </p>
        </div>
      </aside>
    </section>
  );
};

export default Generator;
