import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seatedPose,seatedFraming} from '../src/witch-staging.js';
test('visitor, card and quiet scenes choose deliberate gaze states',()=>{
 assert.equal(seatedPose('sanctum','idle'),'visitor');
 assert.equal(seatedPose('draw','idle'),'table');
 assert.equal(seatedPose('reading','reveal'),'table');
 assert.equal(seatedPose('reading','thinking'),'table');
 assert.equal(seatedPose('reading','speaking'),'visitor');
 assert.equal(seatedPose('sanctum','listening'),'visitor');
 assert.equal(seatedPose('reading','speaking','library'),'quiet');
});
test('draw framing preserves table contact while reading panel reserves left space',()=>{
 const home=seatedFraming('sanctum',null,false),draw=seatedFraming('draw',null,false),read=seatedFraming('reading','reading',false);
 assert.ok(draw.scale<home.scale);assert.ok(draw.tableY>home.tableY);
 assert.ok(Math.abs((home.y-home.scale*1.045)-(home.tableY+.09))<.06);
 assert.ok(Math.abs((draw.y-draw.scale*1.045)-(draw.tableY+.09))<.06);
 assert.ok(read.x<0);assert.equal(seatedFraming('sanctum',null,true).x,0);
});
