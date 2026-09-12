export const witchClips={idle:'Idle',greeting:'Greeting',listening:'Listening',thinking:'Thinking',shuffle:'Shuffle',offer:'Offer',drawing:'Drawing',reveal:'Reveal',speaking:'Speaking'};
export const singleWitchActions=new Set(['greeting','drawing','reveal']);
export function resolveWitchAction(view,action,motion=true){
 if(!motion)return 'idle';
 if(action==='drawing'||action==='reveal')return action;
 if(view==='shuffle')return 'shuffle';
 if(view==='draw')return 'offer';
 return Object.hasOwn(witchClips,action)?action:'idle';
}
// Future integration contract; not yet implemented by the v2 runtime.
export const deferredWitchCapabilities=Object.freeze({handTargetIK:false,visemeLipSync:false,clothSimulation:false,faceVariantSwitch:false});
