import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cards} from '../src/domain.js';
import {cardGuides} from '../src/data/card-guides.js';

const references=JSON.parse(readFileSync(new URL('../src/data/card-references.json',import.meta.url),'utf8'));
test('all 78 fixed cards have distinct, complete Chinese guides and both orientations',()=>{
 assert.deepEqual(Object.keys(cardGuides).sort(),cards.map(c=>c.id).sort());
 for(const [field,minLength] of Object.entries({symbolism:30,upright:40,reversed:40,relationships:20,work:20,question:12})){
  const passages=cards.map(c=>cardGuides[c.id][field]);
  assert.equal(new Set(passages).size,78,`${field} must be card-specific`);
  for(const card of cards) assert.ok(cardGuides[card.id][field].length>=minLength,`${card.id}.${field}`);
 }
 for(const c of cards){assert.equal(c.upright,cardGuides[c.id].upright);assert.equal(c.reversed,cardGuides[c.id].reversed);}
});
test('all 78 guides link to matching primary passages and modern records',()=>{
 assert.deepEqual(Object.keys(references).sort(),cards.map(c=>c.id).sort());
 const suits={w:'wands',c:'cups',s:'swords',p:'coins'};
 const ranks=['','ace','two','three','four','five','six','seven','eight','nine','ten','page','knight','queen','king'];
 const majors=['the fool','the magician','the papess/high priestess','the empress','the emperor','the pope/hierophant','the lovers','the chariot','strength','the hermit','the wheel','justice','the hanged man','death','temperance','the devil','the tower','the star','the moon','the sun','judgement','the world'];
 for(const c of cards){
  const r=references[c.id],rank=Number(c.id.slice(1));
  assert.equal(r.name.toLowerCase(),c.id[0]==='m'?majors[rank]:`${ranks[rank]} of ${suits[c.id[0]]}`,c.id);
  assert.ok(r.waite.length>40,c.id);
  // The cited Part 3 entry for Two of Cups does not include a reversed paragraph.
  assert.equal(r.waite.includes('Reversed'),c.id!=='c02',c.id);
  assert.ok(r.light.length&&r.shadow.length,c.id);
  assert.equal(new URL(r.waiteUrl).hostname,'en.wikisource.org');
  assert.equal(new URL(r.modernUrl).hostname,'github.com');
  assert.ok(!r.waite.includes('Jump to content'),c.id);
 }
});
test('historical variations are preserved rather than labeled universally negative',()=>{
 assert.match(references.m10.waite,/increase.*abundance/i);
 assert.match(cardGuides.m10.reversed,/增长、丰盛/);
 assert.match(references.m17.waite,/hope/i);
 assert.match(cardGuides.m17.upright,/两种传统/);
});
