import { cn } from "../../lib/utils";

interface StoreCardProps {
  headline: string;
  excerpt: string;
  cover: string;
  tag: string;
  stars: string | number;
  lastUpdate: string;
  author: string;
  repoUrl: string;
  onOpenModal: () => void;
  className?: string;
}

export function StoreCard({
  headline,
  excerpt,
  cover,
  tag,
  stars,
  lastUpdate,
  author,
  repoUrl,
  onOpenModal,
  className,
}: StoreCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/80",
        className
      )}
    >
      {/* Imagen Superior */}
      <div className="aspect-[16/9] w-full overflow-hidden p-3">
        <img
          src={cover}
          alt={headline}
          className="h-full w-full rounded-xl object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Contenido */}
      <div className="flex flex-1 flex-col p-5 pt-2">
        {/* Etiquetas y Métricas */}
        <div className="mb-4 flex items-center gap-3 text-xs text-zinc-400">
          <span className="rounded-full bg-zinc-800 px-3 py-1 font-medium text-zinc-200">
            {tag}
          </span>
          <span className="flex items-center gap-1">
            ⭐ {stars}
          </span>
          <span>•</span>
          <span>🔄 {lastUpdate}</span>
        </div>

        {/* Título y Descripción */}
        <h3 className="mb-2 text-xl font-bold tracking-tight text-zinc-100">
          {headline}
        </h3>
        <p className="mb-6 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-400">
          {excerpt}
        </p>

        {/* Footer: Autor y Botones */}
        <div className="mt-auto flex items-center justify-between border-t border-zinc-800 pt-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500">By</span>
            <span className="text-sm font-medium text-zinc-300">{author}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <a 
              href={repoUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Ver en GitHub"
            >
              GitHub
            </a>
            <button 
              onClick={onOpenModal}
              className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-400"
            >
              Detalles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}