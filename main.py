from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

app = FastAPI(title="MCP Manager")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OrdenInstalacion(BaseModel):
    nombre: str

@app.get("/api/catalogo")
def obtener_catalogo():
    return [
        {
            "id": 1,
            "nombre": "Memoria de Código",
            "descripcion": "Dota a tu IA de memoria persistente sobre la estructura de tus repositorios de GitHub.",
            "estado": "Listo para instalar"
        },
        {
            "id": 2,
            "nombre": "Búsqueda Web Automática",
            "descripcion": "Permite que tu IA busque información actualizada en internet mientras programas.",
            "estado": "Listo para instalar"
        },
        {
            "id": 3,
            "nombre": "Conector de Base de Datos",
            "descripcion": "Ejecuta consultas SQL en tu base de datos directamente desde el chat de tu IA.",
            "estado": "Listo para instalar"
        }
    ]

@app.post("/api/instalar")
async def instalar_herramienta(orden: OrdenInstalacion):
    # Simulamos que Python está descargando archivos durante 3 segundos
    await asyncio.sleep(3)
    return {"mensaje": f"¡Éxito! Python ha instalado y configurado '{orden.nombre}' en tu máquina local."}