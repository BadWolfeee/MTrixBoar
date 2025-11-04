import cv2, numpy as np
img=cv2.imread('frontend/src/maps/map.png')
hsv=cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H=hsv[:,:,0]; S=hsv[:,:,1]; V=hsv[:,:,2]
mask = S>40
vals = H[mask].ravel()
print('count', vals.size)
print('H min/max', int(vals.min()), int(vals.max()))
hist,edges=np.histogram(vals, bins=180, range=(0,180))
print('top bins (count,index)')
for c,i in sorted([(int(h),int(i)) for i,h in enumerate(hist)], reverse=True)[:10]:
    print(c,i)
# pick some columns near the line pixels
samples=[(50,440),(200,430),(400,420),(600,420),(800,430),(950,400)]
for x,y in samples:
    hsvv=hsv[y,x]
    print('sample',x,y,'HSV',hsvv.tolist())
