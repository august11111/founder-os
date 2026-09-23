#!/usr/bin/env python3
"""Founder OS — serveur HTTP local avec endpoint /--quit."""
import http.server, os, threading

PORT = 8080


class _Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/--quit':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'ok')
            # Shutdown depuis un thread séparé pour ne pas bloquer la réponse
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        else:
            super().do_GET()

    def log_message(self, *_):
        pass  # silencieux


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.HTTPServer(('', PORT), _Handler) as srv:
        srv.serve_forever()
