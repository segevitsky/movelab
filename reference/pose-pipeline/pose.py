import sys,json,cv2
from ultralytics import YOLO
m=YOLO(sys.argv[1]); cap=cv2.VideoCapture(sys.argv[2]); fps=cap.get(5); out=[]; i=0
while True:
    ok,f=cap.read()
    if not ok: break
    if i%2==0:
        r=m(f,verbose=False)[0]
        if r.keypoints is not None and len(r.keypoints.xy)>0:
            b=r.boxes.xywh.cpu().numpy(); k=int((b[:,2]*b[:,3]).argmax())
            out.append({"t":round(i/fps,3),"xy":r.keypoints.xy[k].cpu().numpy().round(1).tolist(),"c":r.keypoints.conf[k].cpu().numpy().round(2).tolist()})
        else: out.append({"t":round(i/fps,3),"xy":None})
    i+=1
json.dump(out,open(sys.argv[3],'w'))
print(len(out), sum(1 for o in out if o["xy"]))
