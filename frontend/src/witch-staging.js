// Pose and framing are driven by the scene, not random decorative changes.
export function seatedPose(view,action,panel=null){
 if(['library','archive','memory','settings'].includes(panel))return 'quiet';
 if(['drawing','reveal','thinking','shuffle'].includes(action))return 'table';
 if(['listening','speaking','greeting'].includes(action))return 'visitor';
 if(['draw','shuffle','reading'].includes(view))return 'table';
 return 'visitor';
}
export function seatedFraming(view,panel,narrow){
 if(view==='draw'||view==='shuffle')return narrow?{x:0,y:4.22,scale:.41,tableY:3.702}:{x:0,y:2.8,scale:.65,tableY:2.01};
 if(panel==='reading'&&!narrow)return {x:-1.3,y:2.4,scale:.92,tableY:1.3};
 return {x:view==='sanctum'&&!narrow?.85:0,y:2.45,scale:1,tableY:1.3};
}
