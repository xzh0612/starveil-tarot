export const clampFan=(value,count=78)=>Math.max(0,Math.min(count-1,value));
export function fanLayout(index,center,width){
 const step=width<600?18:27,d=index-center;
 return {x:d*step,y:d*d*.17,angle:d*1.45,visible:Math.abs(d*step)<width/2+90,step};
}
