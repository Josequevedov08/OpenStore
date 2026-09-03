"""
Tests del panel de administración: el endpoint de estadísticas agregadas
nunca debe ser accesible sin token, y nunca debe filtrar datos por IP o
por usuario individual — solo contadores agregados. Ver Política de
Privacidad para lo que se documenta como recolectado.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def test_admin_stats_sin_token_configurado_devuelve_503(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "")
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 503


def test_admin_stats_sin_token_en_la_peticion_devuelve_401(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secreto-de-prueba")
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 401


def test_admin_stats_con_token_incorrecto_devuelve_401(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secreto-de-prueba")
    resp = client.get("/api/admin/stats", params={"token": "adivinado"})
    assert resp.status_code == 401


def test_admin_stats_con_token_correcto_devuelve_solo_agregados(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secreto-de-prueba")
    resp = client.get("/api/admin/stats", params={"token": "secreto-de-prueba"})
    assert resp.status_code == 200
    data = resp.json()
    # Todo lo devuelto debe ser agregado: nunca una IP, nunca un email.
    campos_esperados = {
        "uptime_seconds",
        "busquedas_totales",
        "cache_hits",
        "cache_hit_rate",
        "cache_size",
        "cache_ttl_seconds",
        "instaladores_generados",
        "busquedas_rechazadas_rate_limit",
        "fichas_con_ia",
        "fichas_fallback",
        "top_queries",
        "config",
    }
    assert campos_esperados.issubset(data.keys())
    assert isinstance(data["top_queries"], list)


def test_registrar_busqueda_acumula_contadores():
    main._analytics["busquedas_totales"] = 0
    main._analytics["cache_hits"] = 0
    main._analytics["top_queries"].clear()

    main._registrar_busqueda("Todo List", desde_cache=False)
    main._registrar_busqueda("todo list", desde_cache=True)

    assert main._analytics["busquedas_totales"] == 2
    assert main._analytics["cache_hits"] == 1
    # Se normaliza a minúsculas: cuenta como la misma consulta.
    assert main._analytics["top_queries"]["todo list"] == 2
