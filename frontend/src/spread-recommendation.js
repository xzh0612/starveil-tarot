import {spreads} from './domain.js';

const THEMES=[
 {name:'relationship',words:['关系','感情','恋爱','爱情','伴侣','前任','暧昧','复合','婚姻','分手','喜欢','相处','沟通','他','她','我们']},
 {name:'career',words:['工作','事业','职业','学习','考研','考试','创业','项目','领导','同事','收入','财务','转行','offer','升职']},
 {name:'choice',words:['选择','要不要','是否','该不该','决定','比较','哪个','还是','机会','两条路']},
 {name:'future',words:['未来','接下来','趋势','之后','今年','明年','发展','走向','时间']},
 {name:'self',words:['自己','迷茫','成长','情绪','压力','方向','生活','状态','疗愈','内耗','困惑','意义']},
];

const PROFILE={
 one:{self:3,future:2},
 three:{self:4,choice:2,relationship:1,career:1},
 time:{future:5,self:2},
 choice:{choice:7,relationship:1,career:1},
 love:{relationship:8,self:1},
 career:{career:8,choice:1,self:1},
 horse:{future:3,career:2,choice:2},
 celtic:{self:4,relationship:2,career:2,choice:2,future:1},
 year:{future:8},
};

const REASONS={
 one:'牌位聚焦当下最需要看见的一点，适合先把问题从杂音里收拢。',
 three:'用现状、阻碍与建议拆开问题，既看清卡住你的地方，也留下可执行的下一步。',
 time:'把来处、当下与趋势放在同一条线上，帮助你分辨哪些是旧模式，哪些正在发生变化。',
 choice:'把两条道路的机会与挑战并列，适合比较代价与资源，而不是替你做决定。',
 love:'从感受、需求和可观察的互动入手，帮助你理解关系里的回应与边界。',
 career:'从处境、优势、阻碍、资源到下一步逐层梳理，让职业问题落到现实行动。',
 horse:'沿着背景、阻碍、环境与建议推进，适合一个正在变化、需要采取行动的局面。',
 celtic:'为复杂问题保留足够层次，逐格观察内在状态、外部影响与可能发展。',
 year:'把未来十二个月分成可回看的主题，适合做长期规划与阶段性复盘。',
};

function detectThemes(question){
 const text=question.toLowerCase();
 return THEMES.filter(theme=>theme.words.some(word=>text.includes(word))).map(theme=>theme.name);
}

function scoreSpread(spread,themes,index){
 const profile=PROFILE[spread.id]??{};
 const topical=themes.reduce((sum,theme)=>sum+(profile[theme]??0),0);
 const primaryBoost=(themes.includes('relationship')&&spread.id==='love'?20:0)
  +(themes.includes('career')&&spread.id==='career'?20:0)
  +(themes.includes('choice')&&spread.id==='choice'?18:0)
  +(themes.includes('future')&&spread.id==='time'?16:0);
 // A small neutral preference keeps broad questions useful and makes ties stable.
 const baseline={three:3,one:2,time:2,celtic:1}[spread.id]??0;
 return topical+primaryBoost+baseline+(spreads.length-index)*0.0001;
}

export function recommendLocalSpreads(question,catalog=spreads){
 if(typeof question!=='string'||!question.trim())return [];
 const themes=detectThemes(question.trim());
 return catalog.map((spread,index)=>({spread,index,score:scoreSpread(spread,themes,index)}))
  .sort((a,b)=>b.score-a.score||a.index-b.index)
  .slice(0,3)
  .map(({spread})=>({id:spread.id,reason:REASONS[spread.id]??spread.description}));
}
