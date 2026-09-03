import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Star, Languages, AlertTriangle } from 'lucide-react';
import KineticGrid from './components/ui/kinetic-grid';
import PromptInput from './components/ui/prompt-input';
import ToggleGroup, { Toggle } from './components/ui/toggle-group';
import StarOnGithub from './components/ui/button-github';
import StatisticCard1 from './components/ui/statistic-card';
import Pagination from './components/ui/pagination';
import Modal from './components/ui/modal';
import ExpandablePitch from './components/ui/expandable-pitch';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://app-repositorio-github.onrender.com/api/buscar-soluciones';

const LANG_KEY = 'appstore-idioma';

// Textos de la interfaz por idioma. Inglés es el idioma por defecto.
const STRINGS = {
  en: {
    heroTitle: 'Discover. Install. Scale.',
    heroSubtitle:
      'The direct bridge between technical GitHub repositories and your business. Search for any feature you need.',
    placeholder: 'Search for a chatbot, a CRM, etc...',
    searchBtn: 'Search',
    stats: ['Active Repositories', 'Categories', 'Installs Today', 'Uptime'],
    grid: 'Grid',
    list: 'List',
    loading: 'Searching for solutions…',
    viewDetails: 'Get',
    error: "Couldn't reach the server. Please try again in a moment.",
    noResults: 'No results found. Try a different search.',
  },
  es: {
    heroTitle: 'Descubre. Instala. Escala.',
    heroSubtitle:
      'El puente directo entre los repositorios técnicos de GitHub y tu negocio. Busca cualquier funcionalidad.',
    placeholder: 'Busca un chatbot, un CRM, etc...',
    searchBtn: 'Buscar',
    stats: ['Repositorios Activos', 'Categorías', 'Instalaciones Hoy', 'Uptime'],
    grid: 'Grid',
    list: 'Lista',
    loading: 'Buscando soluciones…',
    viewDetails: 'Instalar',
    error: 'No se pudo contactar al servidor. Intenta de nuevo en un momento.',
    noResults: 'Sin resultados. Prueba con otra búsqueda.',
  },
};

const GLOBAL_STAT_VALUES = ['+20,430', '+25', '1,204', '99.9%'];

// Formatea estrellas estilo GitHub: 12400 -> 12.4k, 850 -> 850
function fmtStars(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
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

function Card({ item, viewMode, onOpen, t }) {
  const isList = viewMode === 'list';
  const stars = fmtStars(item.estrellas);

  if (isList) {
    return (
      <div className="mb-2 flex flex-row items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#1A1A1A]/80 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-[#2A2A2A]">
        <div className="flex min-w-0 items-center gap-4">
          <img src={item.imagen_url} alt={item.titulo_comercial} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-zinc-400">{item.lenguaje_principal}</span>
            <h2 className="truncate text-base font-semibold text-white">{item.titulo_comercial}</h2>
          </div>
        </div>

        <p className="hidden min-w-0 flex-1 truncate text-sm text-zinc-300 md:block">
          {item.propuesta_valor}
        </p>

        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1 text-sm text-amber-300">
            <Star className="h-4 w-4 fill-amber-300" />
            {stars}
          </span>
          <div className="w-32">
            <StarOnGithub texto={t.viewDetails} onClick={() => onOpen(item)} className="!py-2 !text-xs" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1A1A1A] transition-all duration-300 hover:border-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.12)]">
      <img
        src={item.imagen_url}
        alt={item.titulo_comercial}
        onClick={() => onOpen(item)}
        className="h-32 w-full cursor-pointer rounded-t-xl object-cover"
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
        <ExpandablePitch text={item.propuesta_valor} className="mt-2" />

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
          <StarOnGithub texto={t.viewDetails} onClick={() => onOpen(item)} />
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
  const [isSearching, setIsSearching] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [proyectoActivo, setProyectoActivo] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, idioma);
    } catch {
      // Almacenamiento no disponible: no es crítico, seguimos en memoria.
    }
  }, [idioma]);

  const globalStats = useMemo(
    () => t.stats.map((label, i) => ({ label, value: GLOBAL_STAT_VALUES[i] })),
    [t]
  );

  const limit = viewMode === 'grid' ? 9 : 10;
  const totalPages = Math.max(1, Math.ceil(resultados.length / limit));
  const startIndex = (currentPage - 1) * limit;
  const paginatedData = resultados.slice(startIndex, startIndex + limit);

  const handleSearch = async (q) => {
    setQuery(q);
    if (!q.trim()) return;
    setIsSearching(true);
    setError('');
    setResultados([]);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, idioma }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const lista = Array.isArray(data) ? data : data.resultados ?? data.soluciones ?? [];
      setResultados(lista);
      setCurrentPage(1);
    } catch (err) {
      setResultados([]);
      setError(t.error);
    } finally {
      setIsSearching(false);
    }
  };

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
          <div className="relative flex w-full items-center justify-center overflow-hidden py-4">
            <div className="w-full max-w-2xl p-4">
              <PromptInput onSubmit={handleSearch} placeholder={t.placeholder} submitLabel={t.searchBtn} />
            </div>
          </div>

          {/* Tarjetas de estadísticas globales */}
          <div className="grid w-full grid-cols-2 gap-4 py-6 md:grid-cols-4">
            {globalStats.map((s) => (
              <StatisticCard1 key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          {/* Selector de vista */}
          <div className="flex w-full justify-end py-6">
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => { setViewMode(v); setCurrentPage(1); }}>
              <Toggle value="grid"><LayoutGrid className="h-4 w-4" /> {t.grid}</Toggle>
              <Toggle value="list"><List className="h-4 w-4" /> {t.list}</Toggle>
            </ToggleGroup>
          </div>

          {isSearching ? (
            <div className="flex w-full flex-col items-center gap-4 py-24 text-zinc-400">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-blue-400" />
              {t.loading}
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
                  {paginatedData.map((item) => (
                    <Card key={item.id} item={item} viewMode={viewMode} onOpen={setProyectoActivo} t={t} />
                  ))}
                </div>

                {/* Paginación premium */}
                <div className="flex w-full justify-center py-10">
                  <Pagination
                    count={totalPages}
                    page={currentPage}
                    onPageChange={setCurrentPage}
                    label="Search results"
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <Modal proyecto={proyectoActivo} onClose={() => setProyectoActivo(null)} idioma={idioma} />
    </div>
  );
}
