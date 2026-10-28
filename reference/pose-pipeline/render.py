import sys, os, subprocess, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from scipy.signal import savgol_filter
sys.path.insert(0, os.path.dirname(__file__))
from proc import segments
import json
from staffproc3 import build as build_staff
from feetproc import build as build_feet
WOOD = (176, 112, 64)
from analysis import top_joints, angle

BG = np.array([246, 243, 238]); NEAR = np.array([28, 32, 44]); FAR = np.array([128, 134, 150])
ACC = (216, 90, 48); FLOOR = (220, 214, 204); SHADOW = (230, 224, 215)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
SS = 3


def mid(a, b): return (a + b) / 2


def sm(x, fps, sec, order=2):
    w = int(fps * sec) | 1
    if w >= len(x): w = len(x) - 1 if (len(x) - 1) % 2 == 1 else len(x) - 2
    return savgol_filter(x, w, order, axis=0) if w > order + 1 else x


def lerpc(t): return tuple(int(v) for v in FAR + (NEAR - FAR) * t)


def draw_figure(size, P, wR, face_dir, ground, th, cam, staff=None, toes=None):
    W, H = size
    im = Image.new('RGB', (W * SS, H * SS), tuple(BG)); d = ImageDraw.Draw(im)
    x0, y0, sc = cam; k = sc * SS
    T = lambda p: ((p[0] - x0) * k, (p[1] - y0) * k)
    t = th * k
    gy = (ground - y0) * k
    # --- perspective floor: horizon, receding grid toward a vanishing point
    hy = gy - H * SS * .2; vx = W * SS / 2
    d.rectangle([0, hy, W * SS, H * SS], fill=(233, 228, 219))
    for i in range(-6, 7):
        xb = vx + i * W * SS * .3
        d.line([(vx + (xb - vx) * .02, hy), (vx + (xb - vx) * 2.2, H * SS * 1.1)], fill=(218, 211, 199), width=max(1, int(t * .16)))
    for j in range(1, 8):
        yy = hy + (H * SS * 1.1 - hy) * (j / 7) ** 1.8
        d.line([(0, yy), (W * SS, yy)], fill=(218, 211, 199), width=max(1, int(t * .16)))
    d.line([(0, hy), (W * SS, hy)], fill=(222, 216, 206), width=max(1, int(t * .15)))
    # --- projected shadow (light from front-left, high): point -> floor
    def proj(p):
        h = ground - p[1]
        return np.array([p[0] + h * .32, ground - h * .2])
    SH = (212, 204, 191)
    def scap(a, b, w):
        A, B = T(proj(a)), T(proj(b)); d.line([A, B], fill=SH, width=max(1, int(w)))
        for q in (A, B): d.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=SH)
    for a_, b_ in [(5, 7), (7, 9), (6, 8), (8, 10), (11, 13), (13, 15), (12, 14), (14, 16), (5, 6), (11, 12)]:
        scap(P[a_], P[b_], t * .9)
    scap(mid(P[5], P[6]), mid(P[11], P[12]), t * 1.7)
    hcs = T(proj(P[17])); r0 = np.linalg.norm(mid(P[5], P[6]) - mid(P[11], P[12])) * .24 * k
    d.ellipse([hcs[0] - r0, hcs[1] - r0 * .8, hcs[0] + r0, hcs[1] + r0 * .8], fill=SH)
    if staff is not None: scap(staff['A'], staff['B'], t * .45)

    def cap(a, b, col, w):
        A, B = T(a), T(b); d.line([A, B], fill=col, width=max(1, int(w)))
        for p in (A, B): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=col)

    def taper(a, b, col, w1, w2):
        A, B = np.array(T(a)), np.array(T(b)); v = B - A; n = np.linalg.norm(v)
        if n < 1: cap(a, b, col, w1); return
        p = np.array([-v[1], v[0]]) / n
        d.polygon([tuple(A + p * w1 / 2), tuple(B + p * w2 / 2), tuple(B - p * w2 / 2), tuple(A - p * w1 / 2)], fill=col)
        for c, w in ((A, w1), (B, w2)): d.ellipse([c[0] - w / 2, c[1] - w / 2, c[0] + w / 2, c[1] + w / 2], fill=col)

    def rod(st):
        """Cylinder in perspective: thickness scales with depth, shaded body, highlight, elliptic tips."""
        A, B = np.array(T(st['A'])), np.array(T(st['B'])); v = B - A; n = np.linalg.norm(v)
        if n < 1: return
        u = v / n; p = np.array([-u[1], u[0]])
        F = st['L'] * 3.5
        sa, sb = F / (F - st['za']), F / (F - st['zb'])
        wa, wb = t * .62 * sa, t * .62 * sb
        dark, mid_, hi = (112, 66, 34), (176, 112, 64), (222, 170, 118)
        d.polygon([tuple(A + p * wa / 2), tuple(B + p * wb / 2), tuple(B - p * wb / 2), tuple(A - p * wa / 2)], fill=dark)
        d.polygon([tuple(A + p * wa * .32), tuple(B + p * wb * .32), tuple(B - p * wb * .42), tuple(A - p * wa * .42)], fill=mid_)
        d.line([tuple(A - p * wa * .18), tuple(B - p * wb * .18)], fill=hi, width=max(1, int((wa + wb) * .09)))
        for c, w in ((A, wa), (B, wb)):
            rx, ry = w * .5, w * .5 * .55
            ang = np.degrees(np.arctan2(u[1], u[0]))
            tip = Image.new('RGBA', (int(w * 2) + 4, int(w * 2) + 4), (0, 0, 0, 0)); td = ImageDraw.Draw(tip)
            cx, cy = tip.size[0] / 2, tip.size[1] / 2
            td.ellipse([cx - ry, cy - rx, cx + ry, cy + rx], fill=dark + (255,))
            tip = tip.rotate(-ang, resample=Image.BICUBIC)
            im.paste(tip, (int(c[0] - tip.size[0] / 2), int(c[1] - tip.size[1] / 2)), tip)

    def limb_set(side, col, grow=0):  # side 0 = left (odd), 1 = right (even)
        sh, el, wr, hp, kn, an = (5, 7, 9, 11, 13, 15) if side == 0 else (6, 8, 10, 12, 14, 16)
        g = grow
        taper(P[sh], P[el], col, t * 1.0 + g, t * .95 + g); taper(P[el], P[wr], col, t * .95 + g, t * .85 + g)
        w = T(P[wr]); r = t * .6 + g / 2; d.ellipse([w[0] - r, w[1] - r, w[0] + r, w[1] + r], fill=col)
        taper(P[hp], P[kn], col, t * 1.1 + g, t * 1.0 + g); taper(P[kn], P[an], col, t * 1.0 + g, t * .9 + g)
        a_ = T(P[an]); r_ = (t * .85 + g) * .62; d.ellipse([a_[0] - r_, a_[1] - r_, a_[0] + r_, a_[1] + r_], fill=col)
        if toes is not None and not np.isnan(toes[0][side][0]):
            toe = toes[0][side]; heel = None if toes[1] is None or np.isnan(toes[1][side][0]) else toes[1][side]
            if heel is not None:
                d.polygon([T(P[an]), T(heel), T(toe)], fill=col)
                cap(heel, toe, col, t * .55 + g); cap(P[an], heel, col, t * .7 + g)
            taper(P[an], toe, col, t * .85 + g, t * .5 + g)

    near_is_R = wR >= .5
    cR, cL = lerpc(wR), lerpc(1 - wR)
    limb_set(1 if not near_is_R else 0, cL if near_is_R else cR)  # far side first
    if staff is not None and staff['behind']: rod(staff)
    ms, mh = mid(P[5], P[6]), mid(P[11], P[12])
    sp = ms - mh; L = np.linalg.norm(sp) + 1e-6; u = sp / L
    tc = (43, 49, 66)
    cap(ms, mh, tc, t * 1.9)
    cap(P[5], P[6], tc, t * 1.1); cap(P[11], P[12], tc, t * 1.2)
    hc = P[17]; hr = L * .24
    cap(ms + u * th * .2, hc - (hc - ms) / (np.linalg.norm(hc - ms) + 1e-6) * hr * .8, tc, t * .9)
    C = T(hc); r = hr * k
    d.ellipse([C[0] - r, C[1] - r, C[0] + r, C[1] + r], fill=tc)
    if staff is not None and not staff['behind']: rod(staff)
    front = 0 if not near_is_R else 1
    limb_set(front, tuple(BG), grow=t * .55)
    limb_set(front, cR if near_is_R else cL)
    return im


def run(kp, vid, outdir, hud=False, segs=None, staff_path=None, feet_path=None):
    os.makedirs(outdir, exist_ok=True)
    segs = segments(kp, segs); fps = segs[0]['fps']
    cap = cv2.VideoCapture(vid); vfps = cap.get(5); vw, vh = int(cap.get(3)), int(cap.get(4)); frames = []
    while True:
        ok, f = cap.read()
        if not ok: break
        frames.append(f)
    PH = 960; PW = int(round(vw * PH / vh / 2) * 2)
    enc = lambda w, h, path: subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-',
                                               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    sbs = enc(PW * 2, PH, f'{outdir}/side_by_side.mp4')
    font = ImageFont.truetype(FONT, 30)
    for si, s in enumerate(segs):
        xy, nr, t = s['xy'], s['near'], s['t']
        tor = np.median(np.linalg.norm(mid(xy[:, 5], xy[:, 6]) - mid(xy[:, 11], xy[:, 12]), axis=1))
        th = tor * .12
        # near side as a smooth 0..1 weight with a soft crossfade
        wR = np.ones(len(t))  # fixed: right side dark, left side light
        # facing direction (for feet): nose vs ear/shoulder centre, smoothed
        fd = sm(xy[:, 0, 0] - mid(xy[:, 5, 0], xy[:, 6, 0]), fps, 1.5)
        # steady head centre
        ms = mid(xy[:, 5], xy[:, 6]); mh = mid(xy[:, 11], xy[:, 12]); sp = ms - mh
        u = sp / (np.linalg.norm(sp, axis=1, keepdims=True) + 1e-6)
        face = (xy[:, 0] * 2 + xy[:, 1] + xy[:, 2]) / 4
        hc = sm((ms + u * tor * .42) * .5 + face * .5, fps, .5)
        X = np.concatenate([xy, hc[:, None]], 1)
        SE = None; ST = None; FT = None
        if feet_path:
            FT, fok = build_feet(feet_path, t, xy, fps)
            HL, hok = build_feet(feet_path, t, xy, fps, key='heel')
            print('feet evidence L %d R %d / %d' % (fok[:, 0].sum(), fok[:, 1].sum(), len(t)))
        if staff_path:
            ST = build_staff(staff_path, vid, t, X, tor, fps)
            SE = np.stack([ST['A'], ST['B']], 1)
            print('staff ok', int(ST['ok'].sum()), '/', len(t), 'L', round(ST['L']), 'behind', int(ST['behind'].sum()), 'foreshortened', int((np.abs(ST['Z']).sum(1) > 1).sum()))
        ground = np.percentile(np.max(xy[:, [15, 16], 1], axis=1), 97) + th * 1.1
        XS = X if SE is None else np.concatenate([X, SE], 1)
        if FT is not None: XS = np.concatenate([XS, np.nan_to_num(FT, nan=0) + np.isnan(FT) * X[:, [15, 16]]], 1)
        ext = XS[:, :, 0].max(1) - XS[:, :, 0].min(1)
        hgt = ground - (XS[:, :, 1].min(1) - tor * .3)
        def cam(W, H):
            psc = min(.9 * W / np.percentile(ext + tor * .6, 98), .82 * H / np.percentile(hgt, 99))
            cx = sm((X[:, :, 0].max(1) + X[:, :, 0].min(1)) / 2, fps, 2.0)
            return [(c - W / (2 * psc), ground - .87 * H / psc, psc) for c in cx]
        pc = cam(PW, PH); GW, GH = 480, 600; gc = cam(GW, GH)
        tj = top_joints(xy); angs = [sm(angle(xy, *tri), fps, .8) for _, _, _, tri in tj]
        gif = enc(GW, GH, f'{outdir}/ex{si+1}.mp4')
        for k in range(len(t)):
            P = X[k]; fi = min(int(round(t[k] * vfps)), len(frames) - 1)
            fig = draw_figure((PW, PH), P, wR[k], fd[k], ground, th, pc[k], None if ST is None else dict(A=ST['A'][k], B=ST['B'][k], za=ST['Z'][k][0], zb=ST['Z'][k][1], behind=bool(ST['behind'][k]), L=ST['L']), None if FT is None else (FT[k], None if HL is None else HL[k]))
            if hud:
                dd = ImageDraw.Draw(fig)
                for j, ((_, name, _, tri), a) in enumerate(zip(tj, angs)):
                    txt = f'{name} {int(round(a[k] / 5) * 5)}°'
                    dd.text((PW * SS - 40, 40 + j * 110), txt, font=ImageFont.truetype(FONT, 84), fill=ACC, anchor='ra', direction='rtl')
            fig = fig.resize((PW, PH), Image.LANCZOS)
            orig = cv2.cvtColor(cv2.resize(frames[fi], (PW, PH), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
            sbs.stdin.write(np.hstack([orig, np.array(fig)]).tobytes())
            g = draw_figure((GW, GH), P, wR[k], fd[k], ground, th, gc[k], None if ST is None else dict(A=ST['A'][k], B=ST['B'][k], za=ST['Z'][k][0], zb=ST['Z'][k][1], behind=bool(ST['behind'][k]), L=ST['L']), None if FT is None else (FT[k], None if HL is None else HL[k])).resize((GW, GH), Image.LANCZOS)
            gif.stdin.write(np.array(g).tobytes())
        gif.stdin.close(); gif.wait()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{outdir}/ex{si+1}.mp4', '-vf',
                        'fps=20,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none',
                        '-loop', '0', f'{outdir}/ex{si+1}.gif'])
    sbs.stdin.close(); sbs.wait()


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('kp'); ap.add_argument('vid'); ap.add_argument('out')
    ap.add_argument('--hud', action='store_true'); ap.add_argument('--segs'); ap.add_argument('--staff'); ap.add_argument('--feet')
    a = ap.parse_args()
    segs = [tuple(map(float, x.split('-'))) for x in a.segs.split(',')] if a.segs else None
    run(a.kp, a.vid, a.out, a.hud, segs, a.staff, a.feet)
