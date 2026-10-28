import sys,json,cv2,numpy as np
from ultralytics import YOLO
vid,prev,out=sys.argv[1:4]
m=YOLO('yolo11x-pose.pt');P=[o for o in json.load(open(prev)) if o.get('xy')];T=np.array([o['t'] for o in P])
cap=cv2.VideoCapture(vid);fps=cap.get(5);H,W=int(cap.get(4)),int(cap.get(3));res=[];i=0
while True:
    ok,f=cap.read()
    if not ok: break
    t=i/fps;o=P[int(np.abs(T-t).argmin())];xy=np.array(o['xy']);c=np.array(o['c'])
    g=xy[c>.2] if (c>.2).sum()>4 else xy
    x0,y0=g.min(0);x1,y1=g.max(0);cx,cy=(x0+x1)/2,(y0+y1)/2;s=max(x1-x0,y1-y0)*1.5+60
    a,b=int(max(0,cx-s/2)),int(max(0,cy-s/2));A,B=int(min(W,cx+s/2)),int(min(H,cy+s/2))
    crop=f[b:B,a:A];r=m(crop,imgsz=640,verbose=False)[0]
    if r.keypoints is not None and len(r.keypoints.xy)>0:
        k=int(r.boxes.conf.argmax());K=r.keypoints.xy[k].cpu().numpy()+[a,b]
        res.append({"t":round(t,4),"xy":K.round(2).tolist(),"c":r.keypoints.conf[k].cpu().numpy().round(3).tolist()})
    else: res.append({"t":round(t,4),"xy":None})
    i+=1
    if i%100==0: print(i,flush=True); json.dump(res,open(out,'w'))
json.dump(res,open(out,'w'));print('done',i)
