#!/usr/bin/env python3
"""Runs on the handheld beside the limits bench.

    python3 collector.py [port] [out-dir]

POST /result   one measurement (JSON), appended to <out-dir>/results.jsonl
GET  /mem      free memory and the browser's memory use, for the memory tests
               ({"avail": MB, "total": MB, "web": MB})

Every two seconds it also writes the temperatures, the CPU and GPU clocks and
the free memory to <out-dir>/samples.jsonl, so slow results can be checked
against heat. Python standard library only.
"""

import glob
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pv-limits'
os.makedirs(OUT, exist_ok=True)
lock = threading.Lock()


def read(path, default=''):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def meminfo():
    info = {}
    for line in read('/proc/meminfo').splitlines():
        key, _, rest = line.partition(':')
        info[key] = int(rest.split()[0]) // 1024
    return info


def web_rss():
    """RSS of the WebKit web process in MB (the page's own memory)."""
    total = 0
    for status in glob.glob('/proc/[0-9]*/status'):
        text = read(status)
        if 'Name:\tWPEWebProcess' in text:
            for line in text.splitlines():
                if line.startswith('VmRSS:'):
                    total += int(line.split()[1]) // 1024
    return total


def append(name, record):
    with lock, open(os.path.join(OUT, name), 'a') as f:
        f.write(json.dumps(record) + '\n')


def sample():
    while True:
        temps = {read(z + '/type'): int(read(z + '/temp', '0')) / 1000 for z in glob.glob('/sys/class/thermal/thermal_zone*')}
        mem = meminfo()
        append('samples.jsonl', {
            'ts': int(time.time() * 1000),
            'temps': temps,
            'cpuMHz': int(read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq', '0')) // 1000,
            'gpuMHz': int(read(glob.glob('/sys/class/devfreq/*gpu*/cur_freq')[0] if glob.glob('/sys/class/devfreq/*gpu*/cur_freq') else '', '0')) // 1000000,
            'avail': mem.get('MemAvailable', 0),
        })
        time.sleep(2)


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body=b'{}'):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/mem'):
            mem = meminfo()
            self.send(200, json.dumps({'avail': mem.get('MemAvailable', 0), 'total': mem.get('MemTotal', 0), 'web': web_rss()}).encode())
        else:
            self.send(404)

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(min(length, 1 << 20))
        if self.path.startswith('/result'):
            try:
                append('results.jsonl', json.loads(body))
            except ValueError:
                pass
            self.send(200)
        else:
            self.send(404)

    def log_message(self, *args):
        pass


threading.Thread(target=sample, daemon=True).start()
ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
