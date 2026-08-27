import { useState, useMemo } from 'react';
import { LayoutGrid, List, Star } from 'lucide-react';
import KineticGrid from './components/ui/kinetic-grid';
import PromptInput from './components/ui/prompt-input';
import ToggleGroup, { Toggle } from './components/ui/toggle-group';
import StarOnGithub from './components/ui/button-github';
import StatisticCard1 from './components/ui/statistic-card';
import Pagination from './components/ui/pagination';
import Modal from './components/ui/modal';
import ExpandablePitch from './components/ui/expandable-pitch';

const API_URL = 'http://127.0.0.1:8000/api/buscar-soluciones';

const GLOBAL_STATS = [
  { label: 'Repositorios Activos', value: '+20,430' },
  { label: 'Categorías', value: '+25' },
  { label: 'Instalaciones Hoy', value: '1,204' },
  { label: 'Uptime', value: '99.9%' },
];

// Formatea estrellas estilo GitHub: 12400 -> 12.4k, 850 -> 850
function fmtStars(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

// --- MODO MOCK DE EMERGENCIA ---
const MOCK_SEED = [
  {
    id: 'mock-1',
    categoria: 'E-Commerce',
    titulo_comercial: 'WhatsBot Food Pro',
    propuesta_valor:
      'Chatbot de ventas para comida rápida en WhatsApp. Toma pedidos, calcula el total con impuestos y los envía al monitor de tu cocina automáticamente.',
    requisitos_externos: ['Cuenta de WhatsApp Business', 'Token de API de OpenAI', 'Servidor Node.js 18+'],
    estrellas: 12400,
    ultima_actualizacion: 'Hace 3 días',
    repoUrl: 'https://github.com',
    tecnologias: ['Python', 'FastAPI', 'Docker'],
    caracteristicas: ['Autocorrección de código', 'Conexión a base de datos', 'Manejo de estados'],
    imagen_url: 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?q=80&w=800&auto=format&fit=crop',
    autor: 'Kushagra2103',
    licencia: 'MIT',
    forks: 34,
    ultima_version: 'v2.1.0',
    issues_abiertos: 45,
    pull_requests: 12,
    lenguaje_principal: 'TypeScript',
    ultimo_commit: 'Hace 2 días',
    readme:
      'Módulo listo para producción que conecta tu catálogo con un asistente conversacional. Incluye webhooks de confirmación, reintentos automáticos y panel de métricas en tiempo real.',
  },
  {
    id: 'mock-2',
    categoria: 'POS',
    titulo_comercial: 'OrderFlow POS',
    propuesta_valor:
      'Sistema de punto de venta open-source. Gestiona mesas, imprime tickets y concilia caja al cierre del día sin suscripciones mensuales.',
    requisitos_externos: ['Docker instalado', 'PostgreSQL 14+', 'Clave API de Stripe'],
    estrellas: 850,
    ultima_actualizacion: 'Hace 1 semana',
    repoUrl: 'https://github.com',
    tecnologias: ['Python', 'FastAPI', 'Docker'],
    caracteristicas: ['Autocorrección de código', 'Conexión a base de datos', 'Manejo de estados'],
    imagen_url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800&auto=format&fit=crop',
    autor: 'Kushagra2103',
    licencia: 'MIT',
    forks: 34,
    ultima_version: 'v2.1.0',
    issues_abiertos: 45,
    pull_requests: 12,
    lenguaje_principal: 'TypeScript',
    ultimo_commit: 'Hace 2 días',
    readme:
      'POS modular con arquitectura de plugins. Soporta múltiples terminales, impresión térmica y conciliación automática con tu pasarela de pagos.',
  },
  {
    id: 'mock-3',
    categoria: 'Logística',
    titulo_comercial: 'DeliveryRouter',
    propuesta_valor:
      'Optimizador de rutas de entrega para repartidores. Reduce el tiempo de envío hasta un 30% agrupando pedidos por zona.',
    requisitos_externos: ['Google Maps API Key', 'Instancia Redis', 'Cuenta de correo SMTP'],
    estrellas: 3200,
    ultima_actualizacion: 'Hace 5 días',
    repoUrl: 'https://github.com',
    tecnologias: ['Python', 'FastAPI', 'Docker'],
    caracteristicas: ['Autocorrección de código', 'Conexión a base de datos', 'Manejo de estados'],
    imagen_url: 'https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?q=80&w=800&auto=format&fit=crop',
    autor: 'Kushagra2103',
    licencia: 'MIT',
    forks: 34,
    ultima_version: 'v2.1.0',
    issues_abiertos: 45,
    pull_requests: 12,
    lenguaje_principal: 'TypeScript',
    ultimo_commit: 'Hace 2 días',
    readme:
      'Motor de enrutamiento basado en grafos que recalcula trayectorias en tiempo real según tráfico y prioridad de entrega.',
  },
];

const expandMock = (n) =>
  Array.from({ length: n }).map((_, i) => {
    const base = MOCK_SEED[i % MOCK_SEED.length];
    return { ...base, id: `mock-${i + 1}`, titulo_comercial: `${base.titulo_comercial} #${i + 1}` };
  });

function Card({ item, viewMode, onOpen }) {
  const isList = viewMode === 'list';
  const stars = fmtStars(item.estrellas);

  if (isList) {
    return (
      <div className="mb-2 flex flex-row items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#1A1A1A]/80 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-[#2A2A2A]">
        <div className="flex min-w-0 items-center gap-4">
          <img src={item.imagen_url} alt={item.titulo_comercial} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-zinc-400">{item.categoria}</span>
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
          <div className="w-44">
            <StarOnGithub texto="Ver Repositorio" onClick={() => onOpen(item)} className="!py-2 !text-xs" />
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
          {item.categoria}
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
            {item.requisitos_externos.map((req, i) => (
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
          <StarOnGithub texto="Ver Repositorio" onClick={() => onOpen(item)} />
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [proyectoActivo, setProyectoActivo] = useState(null);

  const limit = viewMode === 'grid' ? 9 : 10;
  const totalPages = Math.max(1, Math.ceil(resultados.length / limit));
  const startIndex = (currentPage - 1) * limit;
  const paginatedData = resultados.slice(startIndex, startIndex + limit);

  const handleSearch = async (q) => {
    setQuery(q);
    if (!q.trim()) return;
    setIsSearching(true);
    setResultados([]);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const lista = Array.isArray(data) ? data : data.resultados ?? data.soluciones ?? [];
      setResultados(lista);
    } catch (err) {
      // Modo mock: el backend no está disponible, inyectamos datos de demostración.
      setResultados(expandMock(viewMode === 'grid' ? 27 : 30));
      setCurrentPage(1);
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
          {/* Título héroe */}
          <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] md:text-7xl">
            Descubre. Instala. Escala.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-center text-lg text-zinc-400">
            El puente directo entre los repositorios técnicos de GitHub y tu negocio. Busca cualquier funcionalidad.
          </p>

          {/* Buscador */}
          <div className="relative flex w-full items-center justify-center overflow-hidden py-4">
            <div className="w-full max-w-2xl p-4">
              <PromptInput onSubmit={handleSearch} placeholder="Busca un chatbot, un CRM, etc..." />
            </div>
          </div>

          {/* Tarjetas de estadísticas globales */}
          <div className="grid w-full grid-cols-2 gap-4 py-6 md:grid-cols-4">
            {GLOBAL_STATS.map((s) => (
              <StatisticCard1 key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          {/* Selector de vista */}
          <div className="flex w-full justify-end py-6">
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => { setViewMode(v); setCurrentPage(1); }}>
              <Toggle value="grid"><LayoutGrid className="h-4 w-4" /> Grid</Toggle>
              <Toggle value="list"><List className="h-4 w-4" /> List</Toggle>
            </ToggleGroup>
          </div>

          {isSearching ? (
            <div className="flex w-full flex-col items-center gap-4 py-24 text-zinc-400">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-blue-400" />
              Buscando soluciones…
            </div>
          ) : (
            resultados.length > 0 && (
              <div className="w-full">
                <div
                  className={[
                    viewMode === 'grid'
                      ? 'grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]'
                      : 'flex flex-col',
                  ].join(' ')}
                >
                  {paginatedData.map((item) => (
                    <Card key={item.id} item={item} viewMode={viewMode} onOpen={setProyectoActivo} />
                  ))}
                </div>

                {/* Paginación premium */}
                <div className="flex w-full justify-center py-10">
                  <Pagination
                    count={totalPages}
                    page={currentPage}
                    onPageChange={setCurrentPage}
                    label="Resultados de búsqueda"
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <Modal proyecto={proyectoActivo} onClose={() => setProyectoActivo(null)} />
    </div>
  );
}
