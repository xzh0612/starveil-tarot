import {useEffect} from 'react';
import {setSfxEnabled,setSfxErrorHandler} from './sfx';

export function useSfx(enabled,onError){
 useEffect(()=>{
  setSfxEnabled(enabled);
  setSfxErrorHandler(()=>onError?.('此设备暂时无法播放声音。'));
 },[enabled,onError]);
}
