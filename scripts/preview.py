"""
Local preview server -- no Node or Cloudflare account needed.
 
Serves public/ and mocks the two API routes with sample data so the form can be
reviewed and redlined before any credentials exist. Submissions are printed to
the console, not emailed.
 
    python scripts/preview.py
    -> http://localhost:8788
"""
 
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
 
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PORT = 8788
 
SAMPLE_LISTING = {
    "id": "1234567",
    "address": "12 Sample Street, Blackburn VIC 3130",
    "suburb": "Blackburn",
    "type": "House",
    "priceGuide": "$1,150,000 - $1,250,000",
    "status": "Available",
    "agentName": "Anthony Molinaro",
    "agentEmail": "anthony.molinaro@obrienrealestate.com.au",
}
 
SAMPLE_LISTINGS = [
    SAMPLE_LISTING,
    {**SAMPLE_LISTING, "id": "1234568", "address": "4/8 Example Road, Box Hill VIC 3128", "type": "Townhouse"},
    {**SAMPLE_LISTING, "id": "1234569", "address": "27 Placeholder Avenue, Mitcham VIC 3132", "type": "House"},
]
 
 
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)
 
    def _json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
 
    def do_GET(self):
        if self.path.startswith("/api/listing"):
            has_id = "id=" in self.path
            return self._json({"listing": SAMPLE_LISTING} if has_id else {"listings": SAMPLE_LISTINGS})
 
        # SPA fallback, mirroring src/index.js: a path with no file extension
        # (e.g. /12-sample-street-blackburn) is a property-address route, not
        # a missing static file -- serve the app shell instead of a 404.
        path_only = self.path.split("?", 1)[0]
        last_segment = path_only.rsplit("/", 1)[-1]
        if path_only != "/" and "." not in last_segment:
            local_path = os.path.join(ROOT, "index.html")
            if os.path.isfile(local_path):
                with open(local_path, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
 
        return super().do_GET()
 
    def do_POST(self):
        if self.path == "/api/offer":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            print("\n--- OFFER SUBMITTED (preview only, nothing sent) ---")
            print(json.dumps(payload, indent=2))
            return self._json({"ok": True, "loggedToCrm": False})
        return self._json({"errors": ["Not found"]}, 404)
 
    def log_message(self, fmt, *args):
        pass  # keep the console readable
 
 
if __name__ == "__main__":
    print(f"Offer form preview running at http://localhost:{PORT}")
    print(f"  With a property:  http://localhost:{PORT}/?id=1234567")
    print(f"  Property picker:  http://localhost:{PORT}/")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
 
