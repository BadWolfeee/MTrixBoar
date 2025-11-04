#!/usr/bin/env python3
import argparse
from pathlib import Path
import numpy as np
import cv2
from skimage.morphology import skeletonize
import svgwrite

# --- Polyline simplification (RDP) ---
def rdp(points, epsilon):
    if len(points) < 3:
        return list(map(lambda p: [float(p[0]), float(p[1])], points))
    pts = np.asarray(points, dtype=float)
    start, end = pts[0], pts[-1]
    vec = end - start
    if np.allclose(vec, 0):
        dists = np.linalg.norm(pts - start, axis=1)
    else:
        # perpendicular distance from line
        dists = np.abs(np.cross(vec, pts - start)) / (np.linalg.norm(vec) + 1e-9)
    idx = int(np.argmax(dists))
    dmax = float(dists[idx])
    if dmax > epsilon:
        left = rdp(pts[: idx + 1], epsilon)
        right = rdp(pts[idx:], epsilon)
        return left[:-1] + right
    else:
        return [[float(start[0]), float(start[1])], [float(end[0]), float(end[1])]]

# --- Skeleton tracing to polylines ---
NEIGHBORS = [(-1,-1), (0,-1), (1,-1), (-1,0), (1,0), (-1,1), (0,1), (1,1)]

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

# --- Color-agnostic mask against gray background ---

def deltaE76(lab, bg_lab):
    d = lab.astype(np.float32) - bg_lab.astype(np.float32)
    return np.sqrt(np.sum(d*d, axis=2))

def mask_lines_auto(img_bgr, delta_thresh=12.0, colorfulness_thresh=18, blur=1):
    if blur > 0:
        img_bgr = cv2.GaussianBlur(img_bgr, (blur|1, blur|1), 0)
    # Background estimate: robust median over full image
    bg = np.median(img_bgr.reshape(-1,3), axis=0).astype(np.uint8)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    bg_lab = cv2.cvtColor(bg.reshape(1,1,3), cv2.COLOR_BGR2LAB)[0,0]
    dE = deltaE76(lab, bg_lab)
    # Colorfulness: channel range (gray has low range)
    maxc = img_bgr.max(axis=2).astype(np.int16)
    minc = img_bgr.min(axis=2).astype(np.int16)
    colorfulness = (maxc - minc).astype(np.uint8)
    mask = (dE > float(delta_thresh)) & (colorfulness > int(colorfulness_thresh))
    return mask.astype(np.uint8)

# --- Optional: HSV color masks (kept for explicit-color mode) ---

def color_mask_hsv_generic(img_bgr, colors):
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    accum = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for name in colors:
        name = name.lower()
        if name == 'red':
            lower1 = np.array([0, 10, 80]); upper1 = np.array([10, 255, 255])
            lower2 = np.array([170, 10, 80]); upper2 = np.array([180, 255, 255])
            m = cv2.inRange(hsv, lower1, upper1) | cv2.inRange(hsv, lower2, upper2)
        elif name == 'green':
            lower = np.array([35, 10, 80]); upper = np.array([85, 255, 255])
            m = cv2.inRange(hsv, lower, upper)
        elif name == 'blue':
            lower = np.array([95, 20, 70]); upper = np.array([130, 255, 255])
            m = cv2.inRange(hsv, lower, upper)
        elif name == 'orange':
            lower = np.array([10, 20, 80]); upper = np.array([25, 255, 255])
            m = cv2.inRange(hsv, lower, upper)
        else:
            raise ValueError(f'Unknown color: {name}')
        accum |= m
    return (accum>0).astype(np.uint8)

# --- SVG writer ---

def write_svg(width, height, polylines, out_path, stroke="#111", stroke_width=1.6):
    dwg = svgwrite.Drawing(out_path, size=(width, height))
    dwg.add(dwg.rect(insert=(0,0), size=(width, height), fill='none'))
    for pts in polylines:
        if len(pts) < 2:
            continue
        dwg.add(dwg.polyline(points=[(float(x), float(y)) for x,y in pts],
                             fill='none', stroke=stroke, stroke_width=stroke_width,
                             stroke_linecap='round', stroke_linejoin='round'))
    dwg.save()

# --- Main ---

def main():
    ap = argparse.ArgumentParser(description='Extract colored linework from PNG to SVG polylines')
    ap.add_argument('input', help='Path to input image (PNG/JPG)')
    ap.add_argument('-o','--output', help='Output SVG path (default: alongside input)')

    # Binarization modes
    ap.add_argument('--mode', choices=['auto','hsv'], default='auto', help='auto: distance-from-gray; hsv: explicit color list')
    ap.add_argument('--colors', nargs='*', default=['red','green'], help='When --mode hsv, list of colors (e.g. red green blue orange)')

    # Auto thresholds
    ap.add_argument('--delta', type=float, default=12.0, help='LAB distance-from-background threshold')
    ap.add_argument('--colorfulness', type=int, default=18, help='RGB range threshold to reject gray background')

    # Morphology + tracing
    ap.add_argument('--open', dest='open_sz', type=int, default=1, help='Opening kernel size (px)')
    ap.add_argument('--close', dest='close_sz', type=int, default=3, help='Closing kernel size (px)')
    ap.add_argument('--min_component_area', type=int, default=150, help='Discard tiny blobs (px)')
    ap.add_argument('--min_points', type=int, default=6, help='Discard polylines shorter than N points')
    ap.add_argument('--epsilon', type=float, default=1.2, help='Polyline simplification epsilon (px)')
    ap.add_argument('--stroke', default='#111', help='SVG stroke color')
    ap.add_argument('--stroke_width', type=float, default=1.6, help='SVG stroke width (px)')
    ap.add_argument('--json', dest='json_path', help='Optional JSON dump of polylines')
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.output) if args.output else inp.with_suffix('.svg')

    img = cv2.imread(str(inp), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'Failed to read image: {inp}')
    h, w = img.shape[:2]

    # 1) Binarize to foreground mask
    if args.mode == 'auto':
        mask = mask_lines_auto(img, delta_thresh=args.delta, colorfulness_thresh=args.colorfulness, blur=1)
    else:
        mask = color_mask_hsv_generic(img, args.colors)

    # 2) Morphological cleanup + gap closing
    k_open = max(1, args.open_sz)
    k_close = max(1, args.close_sz)
    if k_open > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_open, k_open))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k, iterations=1)
    if k_close > 1:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (k_close, k_close))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=1)

    # 3) Remove tiny components
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros_like(mask)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] >= args.min_component_area:
            keep[labels == i] = 1

    if not keep.any():
        write_svg(w, h, [], str(out), stroke=args.stroke, stroke_width=args.stroke_width)
        print(f'No foreground detected; wrote empty SVG: {out}')
        return

    # 4) Skeletonize to 1 px width
    skel = skeletonize(keep.astype(bool)).astype(np.uint8)

    # 5) Trace to polylines and simplify
    paths = trace_paths(skel)
    polylines = []
    for path in paths:
        if len(path) < args.min_points:
            continue
        pts = np.array([[x, y] for x,y in path], dtype=float)
        simp = rdp(pts, args.epsilon)
        polylines.append(simp)

    # 6) SVG output
    write_svg(w, h, polylines, str(out), stroke=args.stroke, stroke_width=args.stroke_width)
    print(f'Wrote SVG: {out}  (polylines={len(polylines)})')

if __name__ == '__main__':
    main()






