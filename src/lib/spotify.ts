const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com'
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

const TOKEN_STORAGE_KEY = 'dw3_token'
const VERIFIER_KEY = 'dw3_code_verifier'

export type SpotifyToken = {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scope?: string
  tokenType?: string
}

type SpotifyFetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
}

const encoder = new TextEncoder()

const getClientId = () => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
  if (!clientId) {
    throw new Error('Missing VITE_SPOTIFY_CLIENT_ID')
  }
  return clientId
}

const getRedirectUri = () => {
  const envRedirect = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as
    | string
    | undefined
  if (envRedirect) {
    return envRedirect
  }
  return `${window.location.origin}/generator`
}

const generateRandomString = (length: number) => {
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const randomValues = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomValues)
    .map((value) => possible[value % possible.length])
    .join('')
}

const base64UrlEncode = (value: ArrayBuffer) => {
  const bytes = new Uint8Array(value)
  let base64 = ''
  bytes.forEach((byte) => {
    base64 += String.fromCharCode(byte)
  })
  return btoa(base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const sha256 = async (value: string) => {
  const data = encoder.encode(value)
  return crypto.subtle.digest('SHA-256', data)
}

export const getStoredToken = (): SpotifyToken | null => {
  const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SpotifyToken
  } catch {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    return null
  }
}

export const storeToken = (token: SpotifyToken) => {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token))
}

export const clearStoredToken = () => {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}

export const getAuthUrl = async (scopes: string[]) => {
  const verifier = generateRandomString(96)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const challenge = base64UrlEncode(await sha256(verifier))
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: scopes.join(' '),
  })
  return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`
}

export const exchangeCodeForToken = async (code: string) => {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) {
    throw new Error('Missing code verifier. Please try logging in again.')
  }
  const params = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  })
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to exchange token')
  }
  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
    token_type?: string
  }
  const token: SpotifyToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    tokenType: data.token_type,
  }
  storeToken(token)
  return token
}

export const refreshAccessToken = async (refreshToken?: string) => {
  if (!refreshToken) return null
  const params = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!response.ok) {
    return null
  }
  const data = (await response.json()) as {
    access_token: string
    expires_in: number
    scope?: string
    token_type?: string
  }
  const token: SpotifyToken = {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    tokenType: data.token_type,
  }
  storeToken(token)
  return token
}

export const spotifyFetch = async <T>(
  path: string,
  token: SpotifyToken,
  options: SpotifyFetchOptions = {},
): Promise<T> => {
  const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      ...options.headers,
    },
  })
  if (response.status === 204) {
    return {} as T
  }
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Spotify request failed')
  }
  return (await response.json()) as T
}

export type SpotifyUser = {
  id: string
  display_name: string | null
  country?: string
}

export type SpotifyPlaylist = {
  id: string
  name: string
  tracks: {
    total: number
  }
  images?: { url: string }[]
}

export type SpotifyTrack = {
  id: string
  uri: string
  name: string
  artists: { id: string; name: string }[]
}

export const fetchCurrentUser = (token: SpotifyToken) =>
  spotifyFetch<SpotifyUser>('/me', token)

export const fetchAllPlaylists = async (token: SpotifyToken) => {
  let url: string | null = '/me/playlists?limit=50'
  const items: SpotifyPlaylist[] = []
  while (url) {
    const data = await spotifyFetch<{
      items: SpotifyPlaylist[]
      next: string | null
    }>(url, token)
    items.push(...data.items)
    url = data.next
  }
  return items
}

export const searchPlaylists = async (
  token: SpotifyToken,
  query: string,
  limit = 3,
) => {
  const params = new URLSearchParams({
    q: query,
    type: 'playlist',
    limit: String(limit),
  })
  const data = await spotifyFetch<{
    playlists: { items: SpotifyPlaylist[] }
  }>(`/search?${params.toString()}`, token)
  return data.playlists.items
}

export const fetchPlaylistTracks = async (
  token: SpotifyToken,
  playlistId: string,
  maxTracks = 300,
) => {
  let url: string | null =
    `/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,uri,name,artists(id,name))),next`
  const tracks: SpotifyTrack[] = []
  while (url && tracks.length < maxTracks) {
    const data = await spotifyFetch<{
      items: { track: SpotifyTrack | null }[]
      next: string | null
    }>(url, token)
    data.items.forEach((item) => {
      if (item.track) {
        tracks.push(item.track)
      }
    })
    url = data.next
  }
  return tracks
}

export const fetchArtistAlbums = async (
  token: SpotifyToken,
  artistId: string,
  market = 'US',
) => {
  const albums: { id: string }[] = []
  let url: string | null =
    `/artists/${artistId}/albums?include_groups=album,single&limit=50&market=${market}`
  while (url) {
    const data = await spotifyFetch<{
      items: { id: string }[]
      next: string | null
    }>(url, token)
    albums.push(...data.items)
    url = data.next
  }
  return albums
}

export const fetchAlbumTracks = async (
  token: SpotifyToken,
  albumId: string,
) => {
  let url: string | null = `/albums/${albumId}/tracks?limit=50`
  const tracks: SpotifyTrack[] = []
  while (url) {
    const data = await spotifyFetch<{
      items: SpotifyTrack[]
      next: string | null
    }>(url, token)
    tracks.push(...data.items)
    url = data.next
  }
  return tracks
}

export const createPlaylist = async (
  token: SpotifyToken,
  userId: string,
  name: string,
  description: string,
  isPublic: boolean,
) => {
  return spotifyFetch<{ id: string }>(`/users/${userId}/playlists`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description,
      public: isPublic,
    }),
  })
}

export const addTracksToPlaylist = async (
  token: SpotifyToken,
  playlistId: string,
  uris: string[],
) => {
  return spotifyFetch(`/playlists/${playlistId}/tracks`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris }),
  })
}

export const replacePlaylistTracks = async (
  token: SpotifyToken,
  playlistId: string,
  uris: string[],
) => {
  return spotifyFetch(`/playlists/${playlistId}/tracks`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris }),
  })
}
