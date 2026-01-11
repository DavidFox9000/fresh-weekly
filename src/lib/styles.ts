export const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-60'

export const buttonPrimary = `${buttonBase} bg-[#1DB954] text-white shadow-sm hover:bg-[#1aa34a]`

export const buttonGhost = `${buttonBase} border border-emerald-400 text-emerald-800 hover:border-emerald-500 hover:text-emerald-900 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:border-emerald-500 dark:hover:text-white dark:hover:bg-emerald-900/40`

export const panelBase =
  'rounded-3xl border border-emerald-100/70 bg-white/80 shadow-[0_30px_80px_-60px_rgba(13,100,64,0.5)] backdrop-blur dark:border-emerald-900/70 dark:bg-slate-900/70 dark:shadow-[0_30px_80px_-60px_rgba(0,0,0,0.8)]'

export const inputBase =
  'mt-2 w-full rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-emerald-900 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-emerald-700 dark:focus:ring-emerald-900'
