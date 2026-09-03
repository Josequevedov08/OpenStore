import { useEffect, useMemo, useState, useCallback } from 'react';
import { LayoutGrid, List, Star, Languages, AlertTriangle, Bot, Clock } from 'lucide-react';
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
const RECENT_KEY = 'appstore-busquedas-recientes';
const PAGE_SIZE = 12; // debe coincidir con el per_page del backend
const MAX_RECENT = 6;

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

function leerRecientes() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function guardarReciente(q) {
  try {
    const actual = leerRecientes().filter((x) => x.toLowerCase() !== q.toLowerCase());
    const nuevo = [q, ...actual].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(nuevo));
    return nuevo;
  } catch {
    return leerRecientes();
  }
}

function LanguageSwitch({ idioma, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#1A1A1A] p-1">
      <Languages className="ml-1.5 h-4 w-4 text-zinc-500" />
      {['en', 'es'].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={[
            'rounded-lg px-3 py-1.5 text-sm font-semibold uppercase transition-colors',
            idioma === code ? 'bg-white/10 text-white shadow-inner' : 'text-zinc-400 hover:text-white',
          ].join(' ')}
        >
          {code}
        </button>
      ))}
    </div>
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

function SkeletonCard({ viewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="mb-2 flex animate-pulse items-center gap-4 rounded-xl border border-white/10 bg-[#1A1A1A]/80 px-3 py-2">
        <div className="h-14 w-14 shrink-0 rounded-lg bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-white/5" />
          <div className="h-4 w-48 rounded bg-white/5" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1A1A1A]">
      <div className="h-32 w-full bg-white/5" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-16 rounded-full bg-white/5" />
        <div className="h-5 w-3/4 rounded bg-white/5" />
        <div className="h-3 w-full rounded bg-white/5" />
        <div className="h-3 w-5/6 rounded bg-white/5" />
        <div className="mt-4 h-10 w-full rounded-xl bg-white/5" />
      </div>
    </div>
  );
}

function Card({ item, viewMode, onOpen, t }) {
  const isList = viewMode === 'list';
  const stars = fmtStars(item.estrellas);
  const pending = isPending(item.propuesta_valor);
  const pitch = stripPendingTag(item.propuesta_valor);
  const onImgError = (e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_IMG;
  };

  if (isList) {
    return (
      <div className="mb-2 flex flex-row items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#1A1A1A]/80 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-[#2A2A2A]">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={item.imagen_url || FALLBACK_IMG}
            onError={onImgError}
            alt={item.titulo_comercial}
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-zinc-400">{item.lenguaje_principal}</span>
            <h2 className="truncate text-base font-semibold text-white">{item.titulo_comercial}</h2>
          </div>
        </div>

        {pending ? (
          <PendingBadge label={t.pending} />
        ) : (
          <p className="hidden min-w-0 flex-1 truncate text-sm text-zinc-300 md:block">
            {pitch}
          </p>
        )}

        <div className="flex shrink-0 items-center gap-3">
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
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1A1A1A] transition-all duration-300 hover:border-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.12)]">
      <img
        src={item.imagen_url || FALLBACK_IMG}
        onError={onImgError}
        alt={item.titulo_comercial}
        onClick={() => onOpen(item)}
        className="h-32 w-full cursor-pointer object-cover"
      />
      <div className="flex flex-1 flex-col p-5">
        <span className="mb-2 inline-block w-fit rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
          {item.lenguaje_principal}
        </span>
        <h2
          onClick={() => onOpen(item)}
          className="cursor-pointer text-xl font-bold text-white hover:text-blue-400"
        >
          {item.titulo_comercial}
        </h2>
        {pending && <PendingBadge label={t.pending} />}
        <ExpandablePitch text={pitch} className="mt-2" />

        {Array.isArray(item.requisitos_externos) && item.requisitos_externos.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {item.requisitos_externos.slice(0, 3).map((req, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300" />
                {req}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-5">
          <div className="flex items-center justify-between text-xs text-zinc-500">
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

export default function App() {
  const [idioma, setIdioma] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
    } catch {
      return 'en';
    }
  });
  const t = STRINGS[idioma];

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
  const [recientes, setRecientes] = useState(() => leerRecientes());

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, idioma);
    } catch {
      // Almacenamiento no disponible: no es crítico, seguimos en memoria.
    }
  }, [idioma]);

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

  // Núcleo de la búsqueda: reintentos automáticos en fallos de red, con
  // soporte para "cargar más" (append) sin perder lo ya mostrado.
  const ejecutarBusqueda = useCallback(
    async (q, { paginaPedida = 1, append = false, ordenPedido = orden, idiomaPedido = idioma } = {}) => {
      if (!q.trim()) return;
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

  const mostrandoInicial = !isSearching && !error && resultados.length === 0 && !query;

  return (
    <div className="relative min-h-screen w-full bg-[#121212]">
      {/* Fondo Aislado */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <KineticGrid />
      </div>

      {/* Contenido con Scroll (el body es quien scrollea) */}
      <div className="relative z-10 w-full overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 py-12">
          {/* Selector de idioma */}
          <div className="mb-6 flex w-full justify-end">
            <LanguageSwitch idioma={idioma} onChange={setIdioma} />
          </div>

          {/* Título héroe */}
          <h1 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-5xl md:text-7xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-center text-base text-zinc-400 sm:text-lg">
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
            <p className="-mt-1 max-w-xl text-center text-xs text-zinc-500">{t.searchHint}</p>

            {mostrandoInicial && recientes.length > 0 && (
              <div className="mt-4 flex max-w-xl flex-wrap items-center justify-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-zinc-500">
                  <Clock className="h-3 w-3" /> {t.recentLabel}
                </span>
                {recientes.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleSearch(r)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300 transition-colors hover:bg-white/10"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Métricas reales del último batch de resultados (solo si hay búsqueda) */}
          {searchStats && (
            <div className="grid w-full grid-cols-3 gap-4 py-6">
              {searchStats.map((s) => (
                <StatisticCard1 key={s.label} label={s.label} value={s.value} />
              ))}
            </div>
          )}

          {/* Selectores de vista y orden */}
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

          {isSearching ? (
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
              <div className="flex w-full flex-col items-center gap-2 py-8 text-center text-zinc-400">
                <span className="mb-1 h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-blue-400" />
                <span className="text-sm">{t.loading}</span>
                {retryAttempt > 0 && (
                  <span className="max-w-sm text-xs text-amber-400">
                    {t.retrying.replace('{attempt}', String(retryAttempt))}
                  </span>
                )}
                {isSlow && retryAttempt === 0 && (
                  <span className="max-w-sm text-xs text-zinc-500">{t.loadingSlow}</span>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-10 text-center text-zinc-300">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <p>{error}</p>
            </div>
          ) : query && resultados.length === 0 ? (
            <div className="flex w-full flex-col items-center gap-2 py-24 text-zinc-500">
              <p>{t.noResults}</p>
            </div>
          ) : (
            resultados.length > 0 && (
              <div className="w-full">
                <div
                  className={[
                    viewMode === 'grid'
                      ? 'grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]'
                      : 'flex flex-col',
                  ].join(' ')}
                >
                  {resultados.map((item, i) => (
                    <Card key={`${item.id}-${i}`} item={item} viewMode={viewMode} onOpen={setProyectoActivo} t={t} />
                  ))}
                </div>

                {/* "Cargar más" en vez de paginación: todo lo ya traído se ve
                    de una vez, y este botón trae la siguiente tanda de GitHub. */}
                {hasMore && (
                  <div className="flex w-full justify-center py-10">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
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
        <footer className="mt-10 flex w-full flex-col items-center gap-2 border-t border-white/10 py-8 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="/manual.html" className="hover:text-zinc-300">{t.footerManual}</a>
            <a href="/faq.html" className="hover:text-zinc-300">{t.footerFaq}</a>
            <a href="/terminos.html" className="hover:text-zinc-300">{t.footerTerms}</a>
            <a href="/privacidad.html" className="hover:text-zinc-300">{t.footerPrivacy}</a>
          </div>
          <span>OpenStore</span>
        </footer>
      </div>

      <Modal
        proyecto={proyectoActivo}
        onClose={() => setProyectoActivo(null)}
        idioma={idioma}
        installerUrl={INSTALLER_URL}
      />
    </div>
  );
}
