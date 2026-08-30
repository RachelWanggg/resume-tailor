#!/usr/bin/env python3
import argparse
import base64
import hashlib
import http.client
import json
import os
import socket
import struct
import sys
import time
from urllib.parse import urlparse


def http_json(port, path, method="GET"):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    conn.request(method, path)
    res = conn.getresponse()
    data = res.read().decode("utf-8", "replace")
    if res.status >= 400:
        raise RuntimeError(f"HTTP {res.status}: {data}")
    return json.loads(data) if data.strip() else None


class WS:
    def __init__(self, url):
        parsed = urlparse(url)
        self.sock = socket.create_connection((parsed.hostname, parsed.port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {parsed.path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{parsed.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = self.sock.recv(4096)
        if b" 101 " not in resp.split(b"\r\n", 1)[0]:
            raise RuntimeError(resp.decode("utf-8", "replace"))
        self.next_id = 1

    def send_frame(self, payload):
        raw = payload.encode("utf-8")
        header = bytearray([0x81])
        if len(raw) < 126:
            header.append(0x80 | len(raw))
        elif len(raw) < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", len(raw)))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", len(raw)))
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(raw))
        self.sock.sendall(header + masked)

    def recv_frame(self):
        first = self.sock.recv(2)
        if len(first) < 2:
            raise RuntimeError("socket closed")
        opcode = first[0] & 0x0F
        length = first[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", self.sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self.sock.recv(8))[0]
        if first[1] & 0x80:
            mask = self.sock.recv(4)
        else:
            mask = None
        chunks = []
        remaining = length
        while remaining:
            chunk = self.sock.recv(remaining)
            if not chunk:
                raise RuntimeError("socket closed mid-frame")
            chunks.append(chunk)
            remaining -= len(chunk)
        data = b"".join(chunks)
        if mask:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        if opcode == 8:
            raise RuntimeError("websocket closed")
        if opcode in (1, 2):
            return data.decode("utf-8", "replace")
        return self.recv_frame()

    def call(self, method, params=None, timeout=10):
        msg_id = self.next_id
        self.next_id += 1
        self.send_frame(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = json.loads(self.recv_frame())
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(json.dumps(msg["error"]))
                return msg.get("result")
        raise TimeoutError(method)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9333)
    parser.add_argument("--url")
    parser.add_argument("--expr")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    if args.url:
        target = http_json(args.port, f"/json/new?{args.url}", "PUT")
    else:
        pages = http_json(args.port, "/json/list")
        if args.list:
            print(json.dumps(pages, indent=2))
            return
        if not pages:
            raise SystemExit("no pages")
        target = pages[0]

    ws = WS(target["webSocketDebuggerUrl"])
    ws.call("Runtime.enable")
    if args.expr:
        result = ws.call("Runtime.evaluate", {
            "expression": args.expr,
            "awaitPromise": True,
            "returnByValue": True,
        })
        print(json.dumps(result, indent=2))
    else:
        result = ws.call("Runtime.evaluate", {
            "expression": "({title: document.title, url: location.href, text: document.body?.innerText.slice(0,2000)})",
            "returnByValue": True,
        })
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
