"""
Endpoint mínimo de diagnóstico, servido por Vercel (no Render) — infraestructura
totalmente distinta a la del backend principal. Sirve solo para descartar si un
problema de conectividad es específico de Render/su IP o algo más general.
"""

from http.server import BaseHTTPRequestHandler
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "source": "vercel"}).encode())
