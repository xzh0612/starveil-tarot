import {parseReadingOutput,retrieveReadingEvidence} from './reading-rag.mjs';

const ACTION_WORDS=/建议|可以|先|尝试|记录|核实|安排|沟通|复盘|拆分|设定|观察|练习|下一步/u;

function scoreChecks(checks){
 const passed=checks.filter(Boolean).length;
 return Math.round((passed/checks.length)*100);
}

/**
 * Deterministic retrieval regression rubric. This checks grounding coverage,
 * not whether a symbolic interpretation is objectively true.
 */
export function evaluateRetrievalCase({question,cards,requiredKinds=[]}={}){
 const evidence=retrieveReadingEvidence({question,cards});
 const kinds=new Set(evidence.map(item=>item.kind));
 const missingKinds=[...new Set(requiredKinds)].filter(kind=>!kinds.has(kind));
 const missingCards=(cards??[]).filter(card=>!evidence.some(item=>item.cardId===card?.id&&item.kind==='orientation')).map(card=>card?.id).filter(Boolean);
 const issues=[
  ...missingKinds.map(kind=>`missing_evidence:${kind}`),
  ...missingCards.map(cardId=>`missing_card:${cardId}`),
 ];
 const checks=[evidence.length>0,missingKinds.length===0,missingCards.length===0];
 return {ok:issues.length===0,score:scoreChecks(checks),issues,missingKinds,missingCards,evidence};
}

/**
 * Checks the stable prompt contract at the message boundary. The rubric is
 * intentionally small so a prompt rewrite can be reviewed in CI without
 * calling a paid model.
 */
export function evaluatePromptContract(messages=[]){
 const system=messages.find(message=>message?.role==='system')?.content??'';
 const user=messages.find(message=>message?.role==='user')?.content??'';
 const issues=[];
 if(!/evidence|证据|引用/i.test(system))issues.push('missing_system_evidence_rule');
 if(!/json|结构化/i.test(system))issues.push('missing_json_contract');
 if(!/question|cards|evidence/i.test(user)||!/question/i.test(user)||!/cards/i.test(user)||!/evidence/i.test(user))issues.push('missing_grounded_context');
 const checks=[
  !issues.includes('missing_system_evidence_rule'),
  !issues.includes('missing_json_contract'),
  !issues.includes('missing_grounded_context'),
 ];
 return {ok:issues.length===0,score:scoreChecks(checks),issues};
}

/**
 * Runs the offline end-to-end reading rubric against a captured provider
 * response. It validates the same evidence and JSON contract used in the API.
 */
export function evaluateReadingFixture({question,cards,output,requiredKinds=[]}={}){
 const retrieval=evaluateRetrievalCase({question,cards,requiredKinds});
 const issues=[...retrieval.issues];
 let parsed=null,relaxed=null;
 try{
  parsed=parseReadingOutput(output,{cards,evidence:retrieval.evidence,requireCoverage:true});
 }catch{
  issues.push('output_contract');
  try{relaxed=parseReadingOutput(output,{cards,evidence:retrieval.evidence,requireCoverage:false});}catch{}
 }
 const inspected=parsed??relaxed;
 const references=inspected?.references??[];
 const hasReferenceCoverage=(cards??[]).every(card=>references.some(reference=>reference.cardId===card.id));
 if(!hasReferenceCoverage)issues.push('missing_references');
 const actions=inspected?.actions??[];
 const hasActions=Array.isArray(actions)&&actions.length>0;
 if(!hasActions)issues.push('missing_actions');
 const readingText=[inspected?.text??'',...(inspected?.cardReadings??[]).map(item=>item.reading),...actions.map(item=>item.text)].join('\n');
 if(!ACTION_WORDS.test(readingText))issues.push('missing_action');
 const uniqueIssues=[...new Set(issues)];
 const checks=[retrieval.ok,parsed!==null,hasReferenceCoverage,hasActions,ACTION_WORDS.test(readingText)];
 return {ok:uniqueIssues.length===0,score:scoreChecks(checks),issues:uniqueIssues,parsed,retrieval};
}
