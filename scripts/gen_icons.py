#!/usr/bin/env python3
"""Generate webOS app icons + splash without external deps (pure zlib PNG writer)."""
import zlib, struct, math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "app", "assets")

def write_png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)

BG = (250, 251, 253)
ACC = (10, 132, 255)
ACC2 = (120, 205, 255)
WHITE = (255, 255, 255)
INK = (4, 60, 140)

def render(size):
    px = bytearray(size*size*4)
    r = size*0.22            # corner radius
    tri = size*0.34          # play triangle size
    cx = size*0.52           # triangle center x (slight optical shift)
    cy = size*0.5
    for y in range(size):
        for x in range(size):
            i = (y*size+x)*4
            # rounded-rect mask with 2px AA
            dx = max(r - x, x - (size-1-r), 0)
            dy = max(r - y, y - (size-1-r), 0)
            d = math.hypot(dx, dy)
            mask = max(0.0, min(1.0, (r - d)/1.5 + 0.5)) if d > r - 1.5 else 1.0
            if mask <= 0:
                continue
            # subtle vertical gradient on tile
            g = 1.0 - 0.05*(y/size)
            cr, cg, cb = BG[0]*g, BG[1]*g, BG[2]*g
            # play triangle via half-planes, centered
            tx, ty = x-cx+tri*0.06, y-cy
            inside_t = (-tri*0.5 <= ty <= tri*0.5) and (tx >= -tri*0.5) and \
                       (ty <= tri*0.5 - (tx+tri*0.5)*(tri/tri)*0.866) if False else None
            # triangle: apex at right
            ax, ay = tri*0.5, 0.0
            bx, by = -tri*0.42, -tri*0.5
            cx2, cy2 = -tri*0.42, tri*0.5
            def edge(x0,y0,x1,y1):
                return (tx-x0)*(y1-y0)-(ty-y0)*(x1-x0)
            e1, e2, e3 = edge(ax,ay,bx,by), edge(bx,by,cx2,cy2), edge(cx2,cy2,ax,ay)
            tri_in = (e1<=0 and e2<=0 and e3<=0) or (e1>=0 and e2>=0 and e3>=0)
            # AA on triangle edges via distance sampling
            if not tri_in:
                s = 1.2
                for ox,oy in ((s,0),(-s,0),(0,s),(0,-s)):
                    tx2, ty2 = x-cx+tri*0.06+ox, y-cy+oy
                    ex1 = (tx2-ax)*(by-ay)-(ty2-ay)*(bx-ax)
                    ex2 = (tx2-bx)*(cy2-by)-(ty2-by)*(cx2-bx)
                    ex3 = (tx2-cx2)*(ay-cy2)-(ty2-cy2)*(ax-cx2)
                    if (ex1<=0 and ex2<=0 and ex3<=0) or (ex1>=0 and ex2>=0 and ex3>=0):
                        tri_in = True
                        break
            if tri_in:
                t = 1.0
                k = max(0.0, min(1.0, ty/tri*0.5 + 0.5))
                cr, cg, cb = ACC2[0]+(ACC[0]-ACC2[0])*k, ACC2[1]+(ACC[1]-ACC2[1])*k, ACC2[2]+(ACC[2]-ACC2[2])*k
            else:
                # accent glow bottom-right
                gd = math.hypot(x-size*0.85, y-size*0.9)/(size*0.75)
                if gd < 1.0:
                    glow = (1.0-gd)**2 * 0.30
                    cr = cr*(1-glow) + ACC[0]*glow
                    cg = cg*(1-glow) + ACC[1]*glow
                    cb = cb*(1-glow) + ACC[2]*glow
            px[i]   = int(max(0, min(255, cr)))
            px[i+1] = int(max(0, min(255, cg)))
            px[i+2] = int(max(0, min(255, cb)))
            px[i+3] = int(255*mask)
    return px

def splash(w, h):
    px = bytearray(w*h*4)
    cx, cy = w*0.5, h*0.52
    tri = h*0.16
    for y in range(h):
        for x in range(w):
            i = (y*w+x)*4
            g = 1.0 - 0.06*(abs(y-h*0.45)/h)
            cr, cg, cb = BG[0]*g, BG[1]*g, BG[2]*g
            gd = math.hypot(x-w*0.5, y-h*0.55)/(w*0.45)
            if gd < 1.0:
                glow = (1.0-gd)**2 * 0.30
                cr = cr*(1-glow) + ACC[0]*glow
                cg = cg*(1-glow) + ACC[1]*glow
                cb = cb*(1-glow) + ACC[2]*glow
            tx, ty = x-cx+tri*0.06, y-cy
            ax, ay = tri*0.5, 0.0
            bx, by = -tri*0.42, -tri*0.5
            cx2, cy2 = -tri*0.42, tri*0.5
            def edge2(x0,y0,x1,y1,px_,py_):
                return (px_-x0)*(y1-y0)-(py_-y0)*(x1-x0)
            e1 = edge2(ax,ay,bx,by,tx,ty); e2 = edge2(bx,by,cx2,cy2,tx,ty); e3 = edge2(cx2,cy2,ax,ay,tx,ty)
            if (e1<=0 and e2<=0 and e3<=0) or (e1>=0 and e2>=0 and e3>=0):
                k = max(0.0, min(1.0, ty/tri*0.5 + 0.5))
                cr, cg, cb = ACC2[0]+(ACC[0]-ACC2[0])*k, ACC2[1]+(ACC[1]-ACC2[1])*k, ACC2[2]+(ACC[2]-ACC2[2])*k
            px[i], px[i+1], px[i+2], px[i+3] = int(cr), int(cg), int(cb), 255
    return px

os.makedirs(OUT, exist_ok=True)
for name, size in (("icon.png", 80), ("largeIcon.png", 130), ("icon512.png", 512), ("icon160.png", 160)):
    write_png(os.path.join(OUT, name), size, size, render(size))
write_png(os.path.join(OUT, "splash.png"), 1920, 1080, splash(1920, 1080))
