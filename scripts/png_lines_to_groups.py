#!/usr/bin/env python3
import argparse
from pathlib import Path
import numpy as np
import cv2
from skimage.morphology import skeletonize
import json

# --- Hue helpers ---
def hsv_mask_ranges(hsv, ranges):
    mask = np.zeros(hsv.shape[:2], np.uint8)
    for (lo, hi, s_min, v_min) in ranges:
        lo = np.array([lo, s_min, v_min], dtype=np.uint8)
        hi = np.array([hi, 255, 255], dtype=np.uint8)
        mask |= cv2.inRange(hsv, lo, hi)
    return mask

NEIGHBORS = [(-1,-1), (0,-1), (1,-1), (-1,0), (1,0), (-1,1), (0,1), (1,1)]

def rdp(points, epsilon):
    if len(points) < 3:
        return [ [float(x), float(y)] for x,y in points ]
    pts = np.asarray(points, dtype=float)
    start, end = pts[0], pts[-1]
    vec = end - start
    if np.allclose(vec, 0):
        dists = np.linalg.norm(pts - start, axis=1)
    else:
        dists = np.abs(np.cross(vec, pts - start)) / (np.linalg.norm(vec) + 1e-9)
    idx = int(np.argmax(dists))
    dmax = float(dists[idx])
    if dmax > epsilon:
        left = rdp(pts[: idx + 1], epsilon)
        right = rdp(pts[idx:], epsilon)
        return left[:-1] + right
    else:
        return [[float(start[0]), float(start[1])], [float(end[0]), float(end[1])]]

def neighbors(img, x, y):
    h, w = img.shape
    for dx, dy in NEIGHBORS:
        nx, ny = x+dx, y+dy
        if 0 <= nx < w and 0 <= ny < h and img[ny, nx]:
            yield nx, ny

def degree(img, x, y):
    return sum(1 for _ in neighbors(img, x, y))

def trace_paths(skel):
    sk = skel.astype(np.uint8)
    h, w = sk.shape
    visited = np.zeros_like(sk, dtype=bool)
    endpoints = [(x, y) for y in range(h) for x in range(w) if sk[y, x] and degree(sk, x, y) <= 1]
    paths = []

    def walk(start):
        path = []
        x, y = start
        prev = None
        while True:
            visited[y, x] = True
            path.append((x, y))
            nbrs = [p for p in neighbors(sk, x, y) if not visited[p[1], p[0]]]
            if prev is not None and prev in nbrs and len(nbrs) >= 2:
                nbrs.remove(prev)
            if not nbrs:
                break
            if prev is None:
                nxt = nbrs[0]
            else:
                vx, vy = x - prev[0], y - prev[1]
                def score(p):
                    dx, dy = p[0]-x, p[1]-y
                    return -(vx*dx + vy*dy)
                nxt = sorted(nbrs, key=score)[0]
            prev = (x, y)
            x, y = nxt
        return path

    for start in endpoints:
        if not visited[start[1], start[0]]:
            paths.append(walk(start))
    for y in range(h):
        for x in range(w):
            if sk[y, x] and not visited[y, x]:
                paths.append(walk((x, y)))
    return paths

def deltaE76(lab, bg_lab):
    d = lab.astype(np.float32) - bg_lab.astype(np.float32)
    return np.sqrt(np.sum(d*d, axis=2))

def mask_foreground(img_bgr, delta=10.0, colorfulness=12):
    bg = np.median(img_bgr.reshape(-1,3), axis=0).astype(np.uint8)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    bg_lab = cv2.cvtColor(bg.reshape(1,1,3), cv2.COLOR_BGR2LAB)[0,0]
    dE = deltaE76(lab, bg_lab)
    maxc = img_bgr.max(axis=2).astype(np.int16)
    minc = img_bgr.min(axis=2).astype(np.int16)
    colorf = (maxc - minc).astype(np.uint8)
    m = (dE > float(delta)) & (colorf > int(colorfulness))
    return m.astype(np.uint8)

def kmeans(data, k, iters=40):
    idx = np.random.choice(len(data), k, replace=False)
    centers = data[idx].copy()
    for _ in range(iters):
        # assign
        d = ((data[:,None,:]-centers[None,:,:])**2).sum(axis=2)
        labels = d.argmin(axis=1)
        # update
        for i in range(k):
            pts = data[labels==i]
            if len(pts):
                centers[i] = pts.mean(axis=0)
    return centers, labels

def to_hex(bgr):
    b,g,r = [int(x) for x in bgr]
    return f"#{r:02x}{g:02x}{b:02x}"

def main():
    ap = argparse.ArgumentParser(description="Extract colored line groups from PNG and output JSON + SVG")
    ap.add_argument('input', help='Input map PNG')
    ap.add_argument('--k', type=int, default=2, help='Number of line groups (default: 2) [used in kmeans mode]')
    ap.add_argument('--delta', type=float, default=8.0, help='LAB distance from background')
    ap.add_argument('--colorfulness', type=int, default=8, help='RGB range threshold vs grey')
    ap.add_argument('--min_component', type=int, default=30, help='Minimum CC area to keep (px)')
    ap.add_argument('--epsilon', type=float, default=0.5, help='Polyline RDP epsilon (px)')
    ap.add_argument('--min_points', type=int, default=3, help='Minimum points per traced polyline')
    ap.add_argument('--close', type=int, default=3, help='Closing kernel size; set 0 to disable')
    ap.add_argument('--open', type=int, default=0, help='Opening kernel size; set 0 to disable')
    ap.add_argument('--dilate', type=int, default=1, help='Dilate iterations before skeletonization (per group)')
    ap.add_argument('--mode', choices=['kmeans','skeleton_hue','hsv_masks'], default='skeleton_hue', help='Grouping mode')
    ap.add_argument('--palette', nargs='*', default=['red','green'], help='When mode=skeleton_hue, list of color names to classify (e.g., red green blue orange)')
    ap.add_argument('-o', '--outbase', help='Output base path (without extension)')
    args = ap.parse_args()

    inp = Path(args.input)
    outbase = Path(args.outbase) if args.outbase else inp.with_suffix('').parent / 'lines.groups'

    img = cv2.imread(str(inp), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'Cannot read {inp}')
    h, w = img.shape[:2]

    fg = mask_foreground(img, args.delta, args.colorfulness)
    # Mild cleanup: prefer closing (bridge) over opening (which can erase fins)
    if args.close and args.close > 0:
        kc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1,args.close), max(1,args.close)))
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kc, iterations=1)
    if args.open and args.open > 0:
        ko = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1,args.open), max(1,args.open)))
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, ko, iterations=1)

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    groups = []
    if args.mode == 'kmeans':
        ab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[:,:,1:3]
        coords = np.column_stack(np.where(fg>0))  # (y,x)
        if len(coords)==0:
            raise SystemExit('No foreground detected')
        ab_pts = ab[coords[:,0], coords[:,1]].astype(np.float32)
        k = max(1, args.k)
        centers, pix_labels = kmeans(ab_pts, k)

        # Build masks per cluster
        masks = [np.zeros((h,w), np.uint8) for _ in range(k)]
        for (y,x), lab in zip(coords, pix_labels):
            masks[int(lab)][y,x] = 1

        mask_groups = list(enumerate(masks))
    elif args.mode == 'skeleton_hue':
        # skeleton-first, then classify each path by hue majority
        # Prepare a unified skeleton
        uni = fg.copy()
        if args.dilate and args.dilate > 0:
            kx = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
            uni = cv2.dilate(uni, kx, iterations=args.dilate)
        skel = skeletonize(uni.astype(bool)).astype(np.uint8)
        raw_paths = trace_paths(skel)

        # Color ranges per name (OpenCV H: 0..180)
        name2ranges = {
            'red': [(0,10,20,60), (170,180,20,60)],
            'green': [(35,85,15,40)],
            'blue': [(95,130,15,40)],
            'orange': [(10,25,20,60)],
        }
        ranges = []
        for name in args.palette:
            name = name.lower()
            if name not in name2ranges:
                continue
            ranges.append((name, name2ranges[name]))
        if not ranges:
            ranges = [('red', name2ranges['red']), ('green', name2ranges['green'])]

        # Classify each path
        classified = {name: [] for (name, _) in ranges}
        for path in raw_paths:
            if len(path) < args.min_points:
                continue
            # sample a subset of points along the path
            step = max(1, len(path)//50)
            red_counts = []
            for (name, rlist) in ranges:
                masks = [cv2.inRange(hsv, np.array([lo, smin, vmin], np.uint8), np.array([hi,255,255], np.uint8)) for (lo,hi,smin,vmin) in rlist]
                merged = masks[0]
                for m in masks[1:]:
                    merged |= m
                cnt = 0
                for (x,y) in path[::step]:
                    xi = int(max(0, min(w-1, x)))
                    yi = int(max(0, min(h-1, y)))
                    if merged[yi, xi] > 0:
                        cnt += 1
                red_counts.append((name, cnt))
            # choose the best label if any count dominates
            red_counts.sort(key=lambda t: t[1], reverse=True)
            if red_counts and red_counts[0][1] >= max(2, len(path)//50):
                label = red_counts[0][0]
            else:
                # fallback to vertical position (top vs bottom): smaller y -> top (first name)
                mean_y = np.mean([p[1] for p in path])
                label = ranges[0][0] if mean_y < h/2 else ranges[1][0]
            simp = rdp(path, args.epsilon)
            classified[label].append(simp)

        # Build groups from classified paths
        for idx, (name, _) in enumerate(ranges):
            col = {'red':'#e74c3c','green':'#2ecc71','blue':'#40c4ff','orange':'#ffd740'}.get(name, '#ffffff')
            groups.append({ 'id': idx, 'name': name, 'color': col, 'polylines': classified.get(name, []) })

        # write JSON/SVG below
        data = {"width": int(w), "height": int(h), "groups": groups}
        json_path = outbase.with_suffix('.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        svg_path = outbase.with_suffix('.svg')
        with open(svg_path, 'w', encoding='utf-8') as f:
            f.write(f'<?xml version="1.0" encoding="utf-8" ?>\n')
            f.write(f'<svg baseProfile="full" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">')
            for g in groups:
                color = g.get('color', '#ffffff')
                f.write(f'<g data-id="{g.get("name", g["id"]) }" stroke="{color}" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">')
                for pl in g.get('polylines', []):
                    pts = ' '.join([f"{float(x)},{float(y)}" for x,y in pl])
                    f.write(f'<polyline points="{pts}"/>')
                f.write('</g>')
            f.write('</svg>')

        print(f'Wrote {json_path} and {svg_path}')
        return
    elif args.mode == 'hsv_masks':
        # Build explicit masks for each requested palette color, then trace separately
        name2ranges = {
            'red': [(0,10,20,60), (170,180,20,60)],
            'green': [(35,85,15,40)],
            'blue': [(95,130,15,40)],
            'orange': [(10,25,20,60)],
        }
        palette = []
        for name in args.palette:
            if name.lower() in name2ranges:
                palette.append(name.lower())
        if not palette:
            palette = ['red','green']
        groups = []
        for idx, name in enumerate(palette):
            ranges = name2ranges[name]
            m = np.zeros((h,w), np.uint8)
            for (lo,hi,smin,vmin) in ranges:
                m |= cv2.inRange(hsv, np.array([lo,smin,vmin], np.uint8), np.array([hi,255,255], np.uint8))
            # intersect with foreground to drop background bleed
            m = cv2.bitwise_and(m, m, mask=fg)
            if args.close and args.close>0:
                kc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1,args.close),max(1,args.close)))
                m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kc, iterations=1)
            if args.open and args.open>0:
                ko = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1,args.open),max(1,args.open)))
                m = cv2.morphologyEx(m, cv2.MORPH_OPEN, ko, iterations=1)
            num, labimg, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
            keep = np.zeros_like(m)
            for i in range(1, num):
                if stats[i, cv2.CC_STAT_AREA] >= args.min_component:
                    keep[labimg==i] = 1
            if not keep.any():
                groups.append({"id": idx, "name": name, "color": "#ffffff", "polylines": []}); continue
            if args.dilate and args.dilate>0:
                kx = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
                keep = cv2.dilate(keep, kx, iterations=args.dilate)
            skel = skeletonize(keep.astype(bool)).astype(np.uint8)
            raw_paths = trace_paths(skel)
            lines = []
            for path in raw_paths:
                if len(path) < args.min_points: continue
                lines.append(rdp(path, args.epsilon))
            col = {'red':'#e74c3c','green':'#2ecc71','blue':'#40c4ff','orange':'#ffd740'}.get(name, '#ffffff')
            groups.append({ 'id': idx, 'name': name, 'color': col, 'polylines': lines })

        data = {"width": int(w), "height": int(h), "groups": groups}
        json_path = outbase.with_suffix('.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        svg_path = outbase.with_suffix('.svg')
        with open(svg_path, 'w', encoding='utf-8') as f:
            f.write(f'<?xml version="1.0" encoding="utf-8" ?>\n')
            f.write(f'<svg baseProfile="full" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">')
            for g in groups:
                color = g.get('color', '#ffffff')
                f.write(f'<g data-id="{g.get("name", g["id"]) }" stroke="{color}" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">')
                for pl in g.get('polylines', []):
                    pts = ' '.join([f"{float(x)},{float(y)}" for x,y in pl])
                    f.write(f'<polyline points="{pts}"/>')
                f.write('</g>')
            f.write('</svg>')

        print(f'Wrote {json_path} and {svg_path}')
        return

    # If we reach here, mode was kmeans; finalize groups from masks
    for gi, m in mask_groups:
        num, labimg, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        keep = np.zeros_like(m)
        for i in range(1, num):
            if stats[i, cv2.CC_STAT_AREA] >= args.min_component:
                keep[labimg==i] = 1
        if not keep.any():
            groups.append({"id": gi, "color": "#ffffff", "polylines": []}); continue
        if args.dilate and args.dilate > 0:
            kx = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
            keep = cv2.dilate(keep, kx, iterations=args.dilate)
        skel = skeletonize(keep.astype(bool)).astype(np.uint8)
        raw_paths = trace_paths(skel)
        lines = []
        for path in raw_paths:
            if len(path) < args.min_points: continue
            simp = rdp(path, args.epsilon)
            lines.append(simp)
        # color from cluster center (approx)
        L_mean = 150
        center_lab = np.array([L_mean, centers[gi,0], centers[gi,1]], dtype=np.uint8).reshape(1,1,3)
        center_bgr = cv2.cvtColor(center_lab, cv2.COLOR_Lab2BGR)[0,0]
        groups.append({"id": gi, "color": to_hex(center_bgr), "polylines": lines})

    # JSON output
    data = {"width": int(w), "height": int(h), "groups": groups}
    json_path = outbase.with_suffix('.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f)

    # SVG output
    svg_path = outbase.with_suffix('.svg')
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(f'<?xml version="1.0" encoding="utf-8" ?>\n')
        f.write(f'<svg baseProfile="full" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">')
        for g in groups:
            color = g.get('color', '#ffffff')
            f.write(f'<g data-id="{g["id"]}" stroke="{color}" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">')
            for pl in g.get('polylines', []):
                pts = ' '.join([f"{float(x)},{float(y)}" for x,y in pl])
                f.write(f'<polyline points="{pts}"/>')
            f.write('</g>')
        f.write('</svg>')

    print(f'Wrote {json_path} and {svg_path}')

if __name__ == '__main__':
    main()
