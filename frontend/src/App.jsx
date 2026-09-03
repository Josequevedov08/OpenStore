import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  LayoutGrid, List, Star, Languages, AlertTriangle, Bot, Clock, Sun, Moon,
  Bookmark, BookmarkCheck, History, Columns3, X, CheckCircle2, Filter,
} from 'lucide-react';
import KineticGrid from './components/ui/kinetic-grid';
import PromptInput from './components/ui/prompt-input';
import ToggleGroup, { Toggle } from './components/ui/toggle-group';
import StarOnGithub from './components/ui/button-github';
import StatisticCard1 from './components/ui/statistic-card';
import Modal from './components/ui/modal';
import ExpandablePitch from './components/ui/expandable-pitch';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://app-repositorio-github.onrender.com/api/buscar-soluciones';

// Mismo host que el buscador, para el endpoint del Instalador Inteligente.
const INSTALLER_URL = API_URL.replace(/\/api\/buscar-soluciones\/?$/, '/api/generar-instalador');
// El backend gratuito (Render) "duerme" tras inactividad; la primera
// petición mientras despierta puede fallar rápido en vez de esperar.
// Lo despertamos apenas carga la página, antes de que el usuario busque.
const HEALTH_URL = API_URL.replace(/\/api\/buscar-soluciones\/?$/, '/health');

// Red de seguridad de desarrollo: si alguien pega por error una URL con
// formato Markdown ("[texto](url)") en VITE_API_URL, avisamos fuerte en
// consola en vez de fallar en silencio con un TypeError críptico de fetch().
if (!/^https?:\/\/[^[\]()]+$/.test(API_URL)) {
  // eslint-disable-next-line no-console
  console.error(
    '[OpenStore] VITE_API_URL no parece una URL válida (¿tiene corchetes/paréntesis de Markdown pegados por error?):',
    API_URL
  );
}

const LANG_KEY = 'appstore-idioma';
const THEME_KEY = 'appstore-theme';
const RECENT_KEY = 'appstore-busquedas-recientes';
const FAVORITES_KEY = 'appstore-favoritos';
const HISTORY_KEY = 'appstore-historial-instalaciones';
const PAGE_SIZE = 12; // debe coincidir con el per_page del backend
const MAX_RECENT = 6;
const MAX_COMPARE = 3;

// Imagen de respaldo (SVG embebido, sin red) para cuando la miniatura de
// Unsplash no carga — nunca dejamos un ícono de "imagen rota".
const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2937"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#g)"/>
      <path d="M150 80 l-20 20 20 20 M250 80 l20 20 -20 20 M190 65 l20 70" stroke="#3b82f6" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
    </svg>`
  );

// Textos de la interfaz por idioma. Inglés es el idioma por defecto.
const STRINGS = {
  en: {
    heroTitle: 'Discover. Install. Scale.',
    heroSubtitle:
      'The direct bridge between technical GitHub repositories and your business. Search for any feature you need.',
    placeholder: 'Search for a chatbot, a CRM, etc...',
    searchBtn: 'Search',
    searchHint: 'Search by keyword, paste a repo URL, or use @username to browse someone\'s repos. Press "/" to focus.',
    recentLabel: 'Recent:',
    statFound: 'Found',
    statStars: 'Combined Stars',
    statLangs: 'Languages',
    grid: 'Grid',
    list: 'List',
    sortStars: 'Top stars',
    sortUpdated: 'Recently updated',
    loading: 'Searching all of GitHub…',
    loadingSlow: "Still working — the free server may be waking up from idle, or the AI is reading each README. This can take up to a minute.",
    retrying: 'Connection dropped — retrying automatically ({attempt}/3)…',
    viewRepo: 'View Repo',
    pending: 'Analysis pending',
    installerReady: 'Installer ready',
    error: "Couldn't reach the server. Please try again in a moment.",
    rateLimitError: "You've searched a lot in a short time — please wait a minute and try again.",
    timeoutError: 'This search is taking too long and was cancelled. Please try again.',
    noResults: 'No results found. Try a different search.',
    loadMore: 'Load more results',
    loadingMore: 'Loading more…',
    footerManual: 'How it works',
    footerFaq: 'FAQ',
    footerTerms: 'Terms & Conditions',
    footerPrivacy: 'Privacy Policy',
    themeToggle: 'Switch to {mode} mode',
    dark: 'dark',
    light: 'light',
    favorites: 'Favorites',
    addFavorite: 'Save to favorites',
    removeFavorite: 'Remove from favorites',
    noFavorites: "You haven't saved any favorites yet. Click the bookmark icon on a card to save it here.",
    history: 'Install history',
    noHistory: "You haven't downloaded an installer yet.",
    historyEntry: '{plataforma} · {fecha}',
    compare: 'Compare',
    compareBar: '{n} selected for comparison',
    compareAction: 'Compare',
    compareTitle: 'Comparing repositories',
    compareClear: 'Clear',
    remove: 'Remove',
    filters: 'Filters',
    filterLanguage: 'Language',
    filterLicense: 'License',
    filterInstallable: 'Installer detected only',
    filterAll: 'All',
    clearFilters: 'Clear filters',
    noFilteredResults: 'No results match these filters.',
    close: 'Close',
    readMore: 'Read more',
    readLess: 'Read less',
  },
  es: {
    heroTitle: 'Descubre. Instala. Escala.',
    heroSubtitle:
      'El puente directo entre los repositorios técnicos de GitHub y tu negocio. Busca cualquier funcionalidad.',
    placeholder: 'Busca un chatbot, un CRM, etc...',
    searchBtn: 'Buscar',
    searchHint: 'Busca por palabra clave, pega la URL de un repo, o usa @usuario para ver sus repos. Presiona "/" para escribir.',
    recentLabel: 'Recientes:',
    statFound: 'Encontrados',
    statStars: 'Estrellas Totales',
    statLangs: 'Lenguajes',
    grid: 'Grid',
    list: 'Lista',
    sortStars: 'Más estrellas',
    sortUpdated: 'Actualizados',
    loading: 'Buscando en todo GitHub…',
    loadingSlow: 'Seguimos trabajando — puede que el servidor gratuito esté "despertando", o la IA está leyendo cada README. Puede tardar hasta un minuto.',
    retrying: 'La conexión se cortó — reintentando automáticamente ({attempt}/3)…',
    viewRepo: 'Ver Repo',
    pending: 'Análisis pendiente',
    installerReady: 'Instalador listo',
    error: 'No se pudo contactar al servidor. Intenta de nuevo en un momento.',
    rateLimitError: 'Buscaste mucho en poco tiempo — espera un minuto e intenta de nuevo.',
    timeoutError: 'Esta búsqueda tardó demasiado y se canceló. Intenta de nuevo.',
    noResults: 'Sin resultados. Prueba con otra búsqueda.',
    loadMore: 'Cargar más resultados',
    loadingMore: 'Cargando más…',
    footerManual: 'Cómo funciona',
    footerFaq: 'Preguntas Frecuentes',
    footerTerms: 'Términos y Condiciones',
    footerPrivacy: 'Política de Privacidad',
    themeToggle: 'Cambiar a modo {mode}',
    dark: 'oscuro',
    light: 'claro',
    favorites: 'Favoritos',
    addFavorite: 'Guardar en favoritos',
    removeFavorite: 'Quitar de favoritos',
    noFavorites: 'Todavía no guardaste favoritos. Haz clic en el ícono de marcador de una tarjeta para guardarla aquí.',
    history: 'Historial de instalación',
    noHistory: 'Todavía no descargaste ningún instalador.',
    historyEntry: '{plataforma} · {fecha}',
    compare: 'Comparar',
    compareBar: '{n} seleccionados para comparar',
    compareAction: 'Comparar',
    compareTitle: 'Comparando repositorios',
    compareClear: 'Limpiar',
    remove: 'Quitar',
    filters: 'Filtros',
    filterLanguage: 'Lenguaje',
    filterLicense: 'Licencia',
    filterInstallable: 'Solo con instalador detectado',
    filterAll: 'Todos',
    clearFilters: 'Limpiar filtros',
    noFilteredResults: 'Ningún resultado coincide con estos filtros.',
    close: 'Cerrar',
    readMore: 'Leer más',
    readLess: 'Leer menos',
  },
};

// Prefijo que el backend antepone cuando la IA no pudo procesar el repo
// (sin API key, cuota agotada, etc.). Lo detectamos para mostrar un badge
// en vez de mezclarlo con el texto de la descripción.
const PENDING_RE = /^(?:🤖\s*)?(?:Analysis pending|Análisis pendiente)\.?\s*/i;

function stripPendingTag(text) {
  return (text || '').replace(PENDING_RE, '');
}

function isPending(text) {
  return PENDING_RE.test(text || '');
}

// Formatea estrellas estilo GitHub: 12400 -> 12.4k, 850 -> 850
function fmtStars(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

function leerJSON(key, porDefecto) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJSON(key, valor) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena, etc.): no
    // es crítico, la función solo deja de persistir entre sesiones.
  }
}

function guardarReciente(q) {
  const actual = leerJSON(RECENT_KEY, []).filter((x) => x.toLowerCase() !== q.toLowerCase());
  const nuevo = [q, ...actual].slice(0, MAX_RECENT);
  guardarJSON(RECENT_KEY, nuevo);
  return nuevo;
}

function LanguageSwitch({ idioma, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
      <Languages className="ml-1.5 h-4 w-4 text-[var(--text-dimmer)]" />
      {['en', 'es'].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={[
            'rounded-lg px-3 py-1.5 text-sm font-semibold uppercase transition-colors',
            idioma === code ? 'bg-blue-500/15 text-[var(--text)] shadow-inner' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
          ].join(' ')}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle({ theme, onToggle, label }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label.replace('{mode}', next === 'dark' ? '' : '')}
      title={label.replace('{mode}', next)}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function PendingBadge({ label }) {
  return (
    <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
      <Bot className="h-3 w-3" />
      {label}
    </span>
  );
}

function InstallerReadyBadge({ label }) {
  return (
    <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  );
}

function SkeletonCard({ viewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="mb-2 flex animate-pulse items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-2">
        <div className="h-14 w-14 shrink-0 rounded-lg bg-[var(--surface-hover)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-[var(--surface-hover)]" />
          <div className="h-4 w-48 rounded bg-[var(--surface-hover)]" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="h-32 w-full bg-[var(--surface-hover)]" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-16 rounded-full bg-[var(--surface-hover)]" />
        <div className="h-5 w-3/4 rounded bg-[var(--surface-hover)]" />
        <div className="h-3 w-full rounded bg-[var(--surface-hover)]" />
        <div className="h-3 w-5/6 rounded bg-[var(--surface-hover)]" />
        <div className="mt-4 h-10 w-full rounded-xl bg-[var(--surface-hover)]" />
      </div>
    </div>
  );
}

function Card({ item, viewMode, onOpen, t, isFavorito, onToggleFavorito, isSeleccionado, onToggleComparar, compareDisabled }) {
  const isList = viewMode === 'list';
  const stars = fmtStars(item.estrellas);
  const pending = isPending(item.propuesta_valor);
  const pitch = stripPendingTag(item.propuesta_valor);
  const instalable = !pending && !!item.comando_arranque;
  const onImgError = (e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_IMG;
  };

  const favBtn = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggleFavorito(item); }}
      aria-label={isFavorito ? t.removeFavorite : t.addFavorite}
      title={isFavorito ? t.removeFavorite : t.addFavorite}
      className={[
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full backdrop-blur-sm transition-colors',
        isFavorito ? 'bg-amber-400/90 text-black' : 'bg-black/40 text-white hover:bg-black/60',
      ].join(' ')}
    >
      {isFavorito ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </button>
  );

  const compareCheckbox = (
    <label
      className="flex items-center gap-1.5 text-xs text-[var(--text-dim)]"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={isSeleccionado}
        disabled={!isSeleccionado && compareDisabled}
        onChange={() => onToggleComparar(item)}
        aria-label={t.compare}
        className="h-3.5 w-3.5 accent-blue-500"
      />
      {t.compare}
    </label>
  );

  if (isList) {
    return (
      <div className="mb-2 flex flex-row items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-[var(--surface-hover)]">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={item.imagen_url || FALLBACK_IMG}
            onError={onImgError}
            alt={item.titulo_comercial}
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-[var(--text-dim)]">{item.lenguaje_principal}</span>
            <h2 className="truncate text-base font-semibold text-[var(--text)]">{item.titulo_comercial}</h2>
          </div>
        </div>

        {pending ? (
          <PendingBadge label={t.pending} />
        ) : (
          <p className="hidden min-w-0 flex-1 truncate text-sm text-[var(--text-dim)] md:block">
            {pitch}
          </p>
        )}

        <div className="flex shrink-0 items-center gap-3">
          {compareCheckbox}
          {favBtn}
          <span className="flex items-center gap-1 text-sm text-amber-300">
            <Star className="h-4 w-4 fill-amber-300" />
            {stars}
          </span>
          <div className="w-32">
            <StarOnGithub texto={t.viewRepo} onClick={() => onOpen(item)} className="!py-2 !text-xs" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-all duration-300 hover:border-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.12)]">
      <div className="relative">
        <img
          src={item.imagen_url || FALLBACK_IMG}
          onError={onImgError}
          alt={item.titulo_comercial}
          onClick={() => onOpen(item)}
          className="h-32 w-full cursor-pointer object-cover"
        />
        <div className="absolute right-2 top-2">{favBtn}</div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-block w-fit rounded-full bg-[var(--surface-hover)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-dim)]">
            {item.lenguaje_principal}
          </span>
          {compareCheckbox}
        </div>
        <h2
          onClick={() => onOpen(item)}
          className="cursor-pointer text-xl font-bold text-[var(--text)] hover:text-blue-400"
        >
          {item.titulo_comercial}
        </h2>
        {pending && <PendingBadge label={t.pending} />}
        {instalable && <InstallerReadyBadge label={t.installerReady} />}
        <ExpandablePitch text={pitch} className="mt-2" readMoreLabel={t.readMore} readLessLabel={t.readLess} />

        {Array.isArray(item.requisitos_externos) && item.requisitos_externos.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {item.requisitos_externos.slice(0, 3).map((req, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300" />
                {req}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-5">
          <div className="flex items-center justify-between text-xs text-[var(--text-dimmer)]">
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="h-3.5 w-3.5 fill-amber-300" />
              {stars}
            </span>
            <span>{item.ultima_actualizacion}</span>
          </div>
          <StarOnGithub texto={t.viewRepo} onClick={() => onOpen(item)} />
        </div>
      </div>
    </article>
  );
}

// Overlay ligero de comparación lado a lado (2-3 repos).
function CompareOverlay({ items, onClose, onRemove, t }) {
  const filas = [
    { label: t.statStars, get: (i) => `⭐ ${fmtStars(i.estrellas)}` },
    { label: 'Forks', get: (i) => i.forks ?? 0 },
    { label: 'Issues', get: (i) => i.issues_abiertos ?? 0 },
    { label: t.filterLanguage, get: (i) => i.lenguaje_principal || '—' },
    { label: t.filterLicense, get: (i) => i.licencia || '—' },
    { label: 'Stack', get: (i) => (i.tecnologias || []).join(', ') || '—' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t.compareTitle}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-full bg-black/30 p-1.5 text-[var(--text-dim)] hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32"></th>
                {items.map((item) => (
                  <th key={item.id} className="p-2 text-left align-top">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-[var(--text)]">{item.titulo_comercial}</span>
                      <button type="button" onClick={() => onRemove(item)} aria-label={t.remove} className="shrink-0 text-[var(--text-dimmer)] hover:text-red-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.label} className="border-t border-[var(--border)]">
                  <td className="p-2 text-xs font-medium uppercase tracking-wide text-[var(--text-dimmer)]">{fila.label}</td>
                  {items.map((item) => (
                    <td key={item.id} className="p-2 text-[var(--text-dim)]">{fila.get(item)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ historial, onClose, t }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t.history}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-full bg-black/30 p-1.5 text-[var(--text-dim)] hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        {historial.length === 0 ? (
          <p className="text-sm text-[var(--text-dimmer)]">{t.noHistory}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {historial.map((h, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <a href={h.repo_url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-[var(--text)] hover:text-blue-400">
                  {h.titulo_comercial}
                </a>
                <span className="shrink-0 text-xs text-[var(--text-dimmer)]">
                  {t.historyEntry.replace('{plataforma}', h.plataforma).replace('{fecha}', h.fecha)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [idioma, setIdioma] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
    } catch {
      return 'en';
    }
  });
  const t = STRINGS[idioma];

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [query, setQuery] = useState('');
  const [orden, setOrden] = useState('stars');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [resultados, setResultados] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [recientes, setRecientes] = useState(() => leerJSON(RECENT_KEY, []));

  // Favoritos, comparar, historial — todo local (sin cuentas ni backend).
  const [favoritos, setFavoritos] = useState(() => leerJSON(FAVORITES_KEY, []));
  const [mostrarFavoritos, setMostrarFavoritos] = useState(false);
  const [seleccionComparar, setSeleccionComparar] = useState([]);
  const [mostrarComparar, setMostrarComparar] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [historial, setHistorial] = useState(() => leerJSON(HISTORY_KEY, []));

  // Filtros client-side sobre lo ya cargado (no gastan cuota de nuevo).
  const [filtroLenguaje, setFiltroLenguaje] = useState('');
  const [filtroLicencia, setFiltroLicencia] = useState('');
  const [filtroInstalable, setFiltroInstalable] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, idioma);
    } catch {
      // Almacenamiento no disponible: no es crítico, seguimos en memoria.
    }
  }, [idioma]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Guardado como string plano (no vía guardarJSON/JSON.stringify): el
    // script anti-parpadeo de index.html y la lectura inicial de este mismo
    // estado (arriba) comparan el valor crudo de localStorage contra
    // 'light'/'dark', así que debe guardarse tal cual, sin comillas de JSON.
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Almacenamiento no disponible: no es crítico, seguimos en memoria.
    }
  }, [theme]);

  // "Despierta" el backend gratuito apenas se carga la página (fire-and-
  // forget, no bloquea nada) para que ya esté listo cuando el usuario
  // termine de escribir su búsqueda, en vez de despertarlo justo entonces.
  useEffect(() => {
    fetch(HEALTH_URL).catch(() => {
      // Silencioso: si falla, la búsqueda real simplemente lo reintentará.
    });
  }, []);

  // Atajo de teclado "/" para enfocar el buscador (como GitHub y otras apps).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== '/') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      document.getElementById('main-search-input')?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleFavorito = useCallback((item) => {
    setFavoritos((prev) => {
      const existe = prev.some((f) => f.id === item.id);
      const nuevo = existe ? prev.filter((f) => f.id !== item.id) : [item, ...prev];
      guardarJSON(FAVORITES_KEY, nuevo);
      return nuevo;
    });
  }, []);

  const toggleComparar = useCallback((item) => {
    setSeleccionComparar((prev) => {
      const existe = prev.some((c) => c.id === item.id);
      if (existe) return prev.filter((c) => c.id !== item.id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, item];
    });
  }, []);

  // Núcleo de la búsqueda: reintentos automáticos en fallos de red, con
  // soporte para "cargar más" (append) sin perder lo ya mostrado.
  const ejecutarBusqueda = useCallback(
    async (q, { paginaPedida = 1, append = false, ordenPedido = orden, idiomaPedido = idioma } = {}) => {
      if (!q.trim()) return;
      setMostrarFavoritos(false);
      if (append) setIsLoadingMore(true);
      else {
        setIsSearching(true);
        setResultados([]);
      }
      setIsSlow(false);
      setRetryAttempt(0);
      setError('');

      const MAX_INTENTOS = 4;
      let ultimoError;
      let res;
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        const controller = new AbortController();
        // Timeout defensivo: si el backend se cuelga por lo que sea, el
        // usuario ve un error accionable en vez de un spinner infinito. Una
        // búsqueda normal tarda 15-30s, pero el backend gratuito puede
        // tardar 30-50s más en "despertar" si estaba dormido — 120s da
        // margen para ambos casos.
        const timeoutId = setTimeout(() => controller.abort(), 120_000);
        const slowId = setTimeout(() => setIsSlow(true), 8_000);
        try {
          res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, idioma: idiomaPedido, pagina: paginaPedida, orden: ordenPedido }),
            signal: controller.signal,
          });
          ultimoError = null;
          break;
        } catch (err) {
          ultimoError = err;
          clearTimeout(timeoutId);
          clearTimeout(slowId);
          // Un timeout real (ya esperamos 120s) o el último intento: no
          // seguimos reintentando, ya perdimos demasiado tiempo.
          if (err?.name === 'AbortError' || intento === MAX_INTENTOS) break;
          setRetryAttempt(intento);
          await new Promise((r) => setTimeout(r, 2000 * intento));
          continue;
        } finally {
          clearTimeout(timeoutId);
          clearTimeout(slowId);
        }
      }

      try {
        if (ultimoError) throw ultimoError;
        if (res.status === 429) {
          const err = new Error('rate_limited');
          err.name = 'RateLimitError';
          throw err;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const lista = Array.isArray(data) ? data : data.resultados ?? data.soluciones ?? [];
        setResultados((prev) => (append ? [...prev, ...lista] : lista));
        setHasMore(lista.length >= PAGE_SIZE);
        setPagina(paginaPedida);
        if (!append && lista.length > 0) {
          setRecientes(guardarReciente(q));
        }
        // URL compartible: refleja la búsqueda actual sin recargar la página.
        if (!append) {
          const params = new URLSearchParams({ q, idioma: idiomaPedido });
          window.history.replaceState(null, '', `?${params.toString()}`);
        }
      } catch (err) {
        if (!append) setResultados([]);
        // eslint-disable-next-line no-console
        console.error('[OpenStore] Búsqueda falló:', err);
        let msg;
        if (err?.name === 'AbortError') msg = t.timeoutError;
        else if (err?.name === 'RateLimitError') msg = t.rateLimitError;
        else {
          const detalle = err ? `${err.name || 'Error'}: ${err.message || String(err)}` : '';
          msg = `${t.error}${detalle ? ` (${detalle})` : ''}`;
        }
        setError(msg);
      } finally {
        setIsSearching(false);
        setIsLoadingMore(false);
        setIsSlow(false);
        setRetryAttempt(0);
      }
    },
    [idioma, orden, t]
  );

  const handleSearch = (q) => {
    setQuery(q);
    setFiltroLenguaje('');
    setFiltroLicencia('');
    setFiltroInstalable(false);
    ejecutarBusqueda(q, { paginaPedida: 1, append: false });
  };

  const handleLoadMore = () => {
    ejecutarBusqueda(query, { paginaPedida: pagina + 1, append: true });
  };

  const handleSortChange = (nuevoOrden) => {
    setOrden(nuevoOrden);
    if (query) ejecutarBusqueda(query, { paginaPedida: 1, append: false, ordenPedido: nuevoOrden });
  };

  // Al cargar: si la URL trae ?q=..., repetimos esa búsqueda (enlace
  // compartible) y respetamos el ?idioma= si viene.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get('q');
    const idiomaParam = params.get('idioma');
    if (idiomaParam === 'es' || idiomaParam === 'en') setIdioma(idiomaParam);
    if (qParam) {
      setQuery(qParam);
      // `idioma` (estado) todavía no refleja el setIdioma de arriba en este
      // mismo tick — pasamos idiomaPedido explícito para no disparar la
      // búsqueda con el idioma por defecto viejo.
      ejecutarBusqueda(qParam, {
        paginaPedida: 1,
        append: false,
        idiomaPedido: idiomaParam === 'es' || idiomaParam === 'en' ? idiomaParam : idioma,
      });
    }
    // Solo al montar: no queremos re-disparar esto en cada cambio de idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listas de opciones para los filtros, derivadas de lo ya cargado.
  const idiomasDisponibles = useMemo(
    () => Array.from(new Set(resultados.map((r) => r.lenguaje_principal).filter(Boolean))).sort(),
    [resultados]
  );
  const licenciasDisponibles = useMemo(
    () => Array.from(new Set(resultados.map((r) => r.licencia).filter(Boolean))).sort(),
    [resultados]
  );

  const resultadosFiltrados = useMemo(() => {
    return resultados.filter((r) => {
      if (filtroLenguaje && r.lenguaje_principal !== filtroLenguaje) return false;
      if (filtroLicencia && r.licencia !== filtroLicencia) return false;
      if (filtroInstalable && !r.comando_arranque) return false;
      return true;
    });
  }, [resultados, filtroLenguaje, filtroLicencia, filtroInstalable]);

  const hayFiltrosActivos = !!(filtroLenguaje || filtroLicencia || filtroInstalable);

  // Métricas reales derivadas del último batch de resultados (nada de
  // números inventados): repos encontrados, estrellas combinadas y
  // cantidad de lenguajes distintos detectados.
  const searchStats = useMemo(() => {
    if (resultados.length === 0) return null;
    const totalStars = resultados.reduce((acc, r) => acc + (Number(r.estrellas) || 0), 0);
    const langs = new Set(resultados.map((r) => r.lenguaje_principal).filter(Boolean));
    return [
      { label: t.statFound, value: `${resultados.length}` },
      { label: t.statStars, value: fmtStars(totalStars) },
      { label: t.statLangs, value: `${langs.size}` },
    ];
  }, [resultados, t]);

  const mostrandoInicial = !isSearching && !error && resultados.length === 0 && !query && !mostrarFavoritos;
  const listaActual = mostrarFavoritos ? favoritos : resultadosFiltrados;

  return (
    <div className="relative min-h-screen w-full bg-[var(--bg)]">
      {/* Fondo Aislado */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <KineticGrid theme={theme} />
      </div>

      {/* Contenido con Scroll (el body es quien scrollea) */}
      <div className="relative z-10 w-full overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 py-12">
          {/* Selector de idioma, tema, favoritos e historial */}
          <div className="mb-6 flex w-full flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMostrarHistorial(true)}
              aria-label={t.history}
              title={t.history}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
            >
              <History className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMostrarFavoritos((v) => !v)}
              aria-pressed={mostrarFavoritos}
              className={[
                'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors',
                mostrarFavoritos
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <Bookmark className="h-4 w-4" /> {t.favorites} ({favoritos.length})
            </button>
            <ThemeToggle theme={theme} onToggle={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))} label={t.themeToggle} />
            <LanguageSwitch idioma={idioma} onChange={setIdioma} />
          </div>

          {/* Título héroe */}
          <h1 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-[var(--text)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-5xl md:text-7xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-center text-base text-[var(--text-dim)] sm:text-lg">
            {t.heroSubtitle}
          </p>

          {/* Buscador */}
          <div className="relative flex w-full flex-col items-center justify-center overflow-hidden py-4">
            <div className="w-full max-w-2xl p-4">
              <PromptInput
                id="main-search-input"
                onSubmit={handleSearch}
                placeholder={t.placeholder}
                submitLabel={t.searchBtn}
              />
            </div>
            <p className="-mt-1 max-w-xl text-center text-xs text-[var(--text-dimmer)]">{t.searchHint}</p>

            {mostrandoInicial && recientes.length > 0 && (
              <div className="mt-4 flex max-w-xl flex-wrap items-center justify-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-[var(--text-dimmer)]">
                  <Clock className="h-3 w-3" /> {t.recentLabel}
                </span>
                {recientes.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleSearch(r)}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Métricas reales del último batch de resultados (solo si hay búsqueda) */}
          {searchStats && !mostrarFavoritos && (
            <div className="grid w-full grid-cols-3 gap-4 py-6">
              {searchStats.map((s) => (
                <StatisticCard1 key={s.label} label={s.label} value={s.value} />
              ))}
            </div>
          )}

          {/* Filtros (solo tiene sentido con resultados de búsqueda reales) */}
          {resultados.length > 0 && !mostrarFavoritos && (
            <div className="flex w-full flex-wrap items-center gap-3 py-3 text-sm">
              <span className="flex items-center gap-1.5 text-[var(--text-dimmer)]">
                <Filter className="h-3.5 w-3.5" /> {t.filters}
              </span>
              <select
                value={filtroLenguaje}
                onChange={(e) => setFiltroLenguaje(e.target.value)}
                aria-label={t.filterLanguage}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text)]"
              >
                <option value="">{t.filterLanguage}: {t.filterAll}</option>
                {idiomasDisponibles.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select
                value={filtroLicencia}
                onChange={(e) => setFiltroLicencia(e.target.value)}
                aria-label={t.filterLicense}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text)]"
              >
                <option value="">{t.filterLicense}: {t.filterAll}</option>
                {licenciasDisponibles.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[var(--text-dim)]">
                <input
                  type="checkbox"
                  checked={filtroInstalable}
                  onChange={(e) => setFiltroInstalable(e.target.checked)}
                  className="h-3.5 w-3.5 accent-blue-500"
                />
                {t.filterInstallable}
              </label>
              {hayFiltrosActivos && (
                <button
                  type="button"
                  onClick={() => { setFiltroLenguaje(''); setFiltroLicencia(''); setFiltroInstalable(false); }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {t.clearFilters}
                </button>
              )}
            </div>
          )}

          {/* Selectores de vista y orden */}
          {!mostrarFavoritos && (
            <div className="flex w-full flex-wrap items-center justify-end gap-3 py-6">
              <ToggleGroup type="single" value={orden} onValueChange={handleSortChange}>
                <Toggle value="stars">{t.sortStars}</Toggle>
                <Toggle value="updated">{t.sortUpdated}</Toggle>
              </ToggleGroup>
              <ToggleGroup type="single" value={viewMode} onValueChange={setViewMode}>
                <Toggle value="grid"><LayoutGrid className="h-4 w-4" /> {t.grid}</Toggle>
                <Toggle value="list"><List className="h-4 w-4" /> {t.list}</Toggle>
              </ToggleGroup>
            </div>
          )}

          {mostrarFavoritos ? (
            <div className="w-full py-6">
              <h2 className="mb-4 text-lg font-bold text-[var(--text)]">{t.favorites}</h2>
              {favoritos.length === 0 ? (
                <p className="py-12 text-center text-sm text-[var(--text-dimmer)]">{t.noFavorites}</p>
              ) : (
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                  {favoritos.map((item) => (
                    <Card
                      key={item.id}
                      item={item}
                      viewMode="grid"
                      onOpen={setProyectoActivo}
                      t={t}
                      isFavorito
                      onToggleFavorito={toggleFavorito}
                      isSeleccionado={seleccionComparar.some((c) => c.id === item.id)}
                      onToggleComparar={toggleComparar}
                      compareDisabled={seleccionComparar.length >= MAX_COMPARE}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : isSearching ? (
            <div className="w-full">
              <div
                className={[
                  viewMode === 'grid'
                    ? 'grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]'
                    : 'flex flex-col',
                ].join(' ')}
              >
                {Array.from({ length: viewMode === 'grid' ? 6 : 5 }).map((_, i) => (
                  <SkeletonCard key={i} viewMode={viewMode} />
                ))}
              </div>
              <div className="flex w-full flex-col items-center gap-2 py-8 text-center text-[var(--text-dim)]">
                <span className="mb-1 h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-400" />
                <span className="text-sm">{t.loading}</span>
                {retryAttempt > 0 && (
                  <span className="max-w-sm text-xs text-amber-400">
                    {t.retrying.replace('{attempt}', String(retryAttempt))}
                  </span>
                )}
                {isSlow && retryAttempt === 0 && (
                  <span className="max-w-sm text-xs text-[var(--text-dimmer)]">{t.loadingSlow}</span>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-10 text-center text-[var(--text-dim)]">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <p>{error}</p>
            </div>
          ) : query && resultados.length === 0 ? (
            <div className="flex w-full flex-col items-center gap-2 py-24 text-[var(--text-dimmer)]">
              <p>{t.noResults}</p>
            </div>
          ) : (
            resultados.length > 0 && (
              <div className="w-full">
                {listaActual.length === 0 ? (
                  <p className="py-16 text-center text-sm text-[var(--text-dimmer)]">{t.noFilteredResults}</p>
                ) : (
                  <div
                    className={[
                      viewMode === 'grid'
                        ? 'grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]'
                        : 'flex flex-col',
                    ].join(' ')}
                  >
                    {listaActual.map((item, i) => (
                      <Card
                        key={`${item.id}-${i}`}
                        item={item}
                        viewMode={viewMode}
                        onOpen={setProyectoActivo}
                        t={t}
                        isFavorito={favoritos.some((f) => f.id === item.id)}
                        onToggleFavorito={toggleFavorito}
                        isSeleccionado={seleccionComparar.some((c) => c.id === item.id)}
                        onToggleComparar={toggleComparar}
                        compareDisabled={seleccionComparar.length >= MAX_COMPARE}
                      />
                    ))}
                  </div>
                )}

                {/* "Cargar más" en vez de paginación: todo lo ya traído se ve
                    de una vez, y este botón trae la siguiente tanda de GitHub. */}
                {hasMore && (
                  <div className="flex w-full justify-center py-10">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoadingMore ? t.loadingMore : t.loadMore}
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Footer legal */}
        <footer className="mt-10 flex w-full flex-col items-center gap-2 border-t border-[var(--border)] py-8 text-xs text-[var(--text-dimmer)]">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="/manual.html" className="hover:text-[var(--text-dim)]">{t.footerManual}</a>
            <a href="/faq.html" className="hover:text-[var(--text-dim)]">{t.footerFaq}</a>
            <a href="/terminos.html" className="hover:text-[var(--text-dim)]">{t.footerTerms}</a>
            <a href="/privacidad.html" className="hover:text-[var(--text-dim)]">{t.footerPrivacy}</a>
          </div>
          <span>OpenStore</span>
        </footer>
      </div>

      {/* Barra flotante de "comparar" cuando hay 2+ seleccionados */}
      {seleccionComparar.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 shadow-2xl">
          <span className="text-sm text-[var(--text)]">{t.compareBar.replace('{n}', String(seleccionComparar.length))}</span>
          <button
            type="button"
            onClick={() => setSeleccionComparar([])}
            className="text-xs text-[var(--text-dimmer)] hover:text-[var(--text)]"
          >
            {t.compareClear}
          </button>
          <button
            type="button"
            disabled={seleccionComparar.length < 2}
            onClick={() => setMostrarComparar(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Columns3 className="h-4 w-4" /> {t.compareAction}
          </button>
        </div>
      )}

      {mostrarComparar && (
        <CompareOverlay
          items={seleccionComparar}
          onClose={() => setMostrarComparar(false)}
          onRemove={toggleComparar}
          t={t}
        />
      )}

      {mostrarHistorial && (
        <HistoryPanel historial={historial} onClose={() => { setMostrarHistorial(false); setHistorial(leerJSON(HISTORY_KEY, [])); }} t={t} />
      )}

      <Modal
        proyecto={proyectoActivo}
        onClose={() => setProyectoActivo(null)}
        idioma={idioma}
        installerUrl={INSTALLER_URL}
      />
    </div>
  );
}
