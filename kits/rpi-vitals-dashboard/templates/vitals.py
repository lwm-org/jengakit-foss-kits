#!/usr/bin/env python3
# Live system-vitals web dashboard for a Raspberry Pi (stdlib only). PORT filled per prompt.
import http.server
import json
import os
import socket

PORT = 8000

def _temp_c():
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f:
            return round(int(f.read().strip()) / 1000.0, 1)
    except Exception:
        return None

def _vitals():
    la = os.getloadavg()
    mem = {}
    try:
        for line in open('/proc/meminfo'):
            k, v = line.split(':')[0], line.split()[1]
            if k in ('MemTotal', 'MemAvailable'):
                mem[k] = int(v) // 1024
    except Exception:
        pass
    st = os.statvfs('/')
    disk_free = st.f_bavail * st.f_frsize // (1024 * 1024)
    return {'load1': round(la[0], 2), 'temp_c': _temp_c(),
            'mem_total_mb': mem.get('MemTotal'), 'mem_avail_mb': mem.get('MemAvailable'),
            'disk_free_mb': disk_free, 'host': socket.gethostname()}

PAGE = '''<!doctype html><meta charset=utf-8><title>Pi vitals</title>
<style>body{font:16px system-ui;margin:2rem;background:#0b0b0c;color:#eee}.c{display:inline-block;margin:.5rem;padding:1rem 1.5rem;border:1px solid #333;border-radius:8px}b{font-size:1.6rem;display:block}</style>
<h1>Raspberry Pi vitals</h1><div id=g></div>
<script>async function t(){let v=await (await fetch('/vitals')).json();document.getElementById('g').innerHTML=Object.entries(v).map(([k,x])=>`<div class=c>${k}<b>${x}</b></div>`).join('');}t();setInterval(t,2000);</script>'''

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def do_GET(self):
        if self.path == '/vitals':
            body = json.dumps(_vitals()).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json')
        else:
            body = PAGE.encode()
            self.send_response(200); self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

def main():
    print(f'[vitals] serving on 0.0.0.0:{PORT}', flush=True)
    http.server.HTTPServer(('0.0.0.0', PORT), H).serve_forever()

if __name__ == '__main__':
    main()
