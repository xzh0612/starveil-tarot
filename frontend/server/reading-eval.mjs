import {analyzeReadingQuestion,parseReadingOutput,requiresProfessionalBoundary,retrieveReadingEvidence,summarizeReadingEvidence} from './reading-rag.mjs';

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

export function evaluateRetrievalSuite(cases=[]){
 const results=cases.map(item=>({name:item?.name??'',...evaluateRetrievalCase(item)}));
 const score=results.length?Math.round(results.reduce((sum,item)=>sum+item.score,0)/results.length):0;
 const failed=results.filter(item=>!item.ok).length;
 return {ok:results.length>0&&failed===0,score,failed,results};
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
 if(!/tier|层级|retrievalReasons/i.test(system))issues.push('missing_evidence_hierarchy');
 if(!/json|结构化/i.test(system))issues.push('missing_json_contract');
 if(!/synthesis|综合解读/i.test(system))issues.push('missing_synthesis_contract');
 if(!/goal|目标/i.test(system))issues.push('missing_goal_routing');
 if(!/retrievalMethod|retrievalScore|retrievalSemanticScore/i.test(system))issues.push('missing_ranker_metadata');
 if(!/evidenceMeta/i.test(system))issues.push('missing_evidence_diagnostics');
 if(!/evidencePlan[^\n]{0,500}(?:引用索引|anchor|application|reference)/i.test(system))issues.push('missing_evidence_plan_rule');
 if(!/coverageStatus/i.test(system))issues.push('missing_coverage_status');
 if(!/goalCoverage/i.test(system)||!/missingGoalCoverage/i.test(system))issues.push('missing_goal_coverage_rule');
 if(!/responsePlan[^\n]{0,500}(?:goal|emphasis)/i.test(system))issues.push('missing_response_plan_goal_rule');
 if(!/goalPlan[^\n]{0,700}(?:order|evidenceIds|逐一回应)/i.test(system))issues.push('missing_goal_plan_rule');
 if(!/synthesis[^\n]{0,900}(?:多牌阵|每张牌|分别|逐张)[^\n]{0,300}(?:核心|概念|证据)/i.test(system))issues.push('missing_synthesis_per_card_rule');
 if(!/<starveil_workflow>[\s\S]*?(?:activeQuestion|逐牌解读)[\s\S]*?(?:synthesis|合读)[\s\S]*?(?:自检|自查)[\s\S]*?<\/starveil_workflow>/i.test(system))issues.push('missing_prompt_workflow');
 if(!/claim|引用说明/i.test(system))issues.push('missing_claim_support');
 if(!/保证|必然|绝对|断言/i.test(system))issues.push('missing_calibration_rule');
 if(!/synthesis[^\n]{0,600}(?:核心锚点|retrievalRequired)/i.test(system))issues.push('missing_synthesis_anchor_rule');
 if(!/澄清分支[^\n]{0,300}(?:必须为空|不得同时返回)/u.test(system))issues.push('missing_clarification_exclusivity');
 if(!/action[^\n]{0,600}(?:reason|理由)[^\n]{0,300}(?:必须|非空|说明)/i.test(system))issues.push('missing_action_reason_rule');
 if(!/action[^\n]{0,900}(?:reason|理由)[^\n]{0,900}(?:证据|evidence)/i.test(system))issues.push('missing_action_reason_support_rule');
 if(!/text[^\n]{0,700}(?:正文|内容)[^\n]{0,700}(?:证据|evidence)/i.test(system))issues.push('missing_text_support_rule');
 if(!/anchor_only[^\n]{0,500}(?:证据|资料)[^\n]{0,500}(?:不足|限制|不确定)/i.test(system))issues.push('missing_coverage_boundary_rule');
 if(!/retrievalRequired/i.test(system))issues.push('missing_anchor_metadata');
 if(!/question|cards|evidence/i.test(user)||!/question/i.test(user)||!/cards/i.test(user)||!/evidence/i.test(user))issues.push('missing_grounded_context');
 if(!/<starveil_context>[\s\S]*<\/starveil_context>/.test(user))issues.push('missing_context_fence');
 if(!/tier|retrievalReasons/.test(user))issues.push('missing_evidence_metadata');
 if(!/goal|目标/i.test(user))issues.push('missing_goal_metadata');
 if(!/sourceType|sourceLabel/.test(user)||!/retrievalRequired/.test(user))issues.push('missing_prompt_evidence_provenance');
 if(!/evidenceMeta/.test(user))issues.push('missing_evidence_diagnostics_context');
 if(!/evidencePlan/.test(user))issues.push('missing_evidence_plan_context');
 if(!/knowledgeMeta/.test(user))issues.push('missing_knowledge_version_context');
 if(!/coverageStatus/.test(user))issues.push('missing_coverage_status_context');
 if(!/goalCoverage/.test(user)||!/missingGoalCoverage/.test(user))issues.push('missing_goal_coverage_context');
 if(!/responsePlan/.test(user)||!/goal/.test(user)||!/emphasis/.test(user))issues.push('missing_response_plan_goal_context');
 if(!/goalPlan/.test(user)||!/goalOrder|order/.test(user))issues.push('missing_goal_plan_context');
 if(!/retrievalRequired/.test(user))issues.push('missing_anchor_metadata_context');
 const checks=[
  !issues.includes('missing_system_evidence_rule'),
  !issues.includes('missing_evidence_hierarchy'),
  !issues.includes('missing_json_contract'),
  !issues.includes('missing_synthesis_contract'),
  !issues.includes('missing_goal_routing'),
  !issues.includes('missing_ranker_metadata'),
  !issues.includes('missing_evidence_diagnostics'),
  !issues.includes('missing_evidence_plan_rule'),
  !issues.includes('missing_coverage_status'),
  !issues.includes('missing_goal_coverage_rule'),
  !issues.includes('missing_response_plan_goal_rule'),
  !issues.includes('missing_goal_plan_rule'),
  !issues.includes('missing_synthesis_per_card_rule'),
  !issues.includes('missing_prompt_workflow'),
  !issues.includes('missing_claim_support'),
  !issues.includes('missing_calibration_rule'),
  !issues.includes('missing_synthesis_anchor_rule'),
  !issues.includes('missing_clarification_exclusivity'),
  !issues.includes('missing_action_reason_rule'),
  !issues.includes('missing_action_reason_support_rule'),
  !issues.includes('missing_text_support_rule'),
  !issues.includes('missing_coverage_boundary_rule'),
  !issues.includes('missing_anchor_metadata'),
  !issues.includes('missing_grounded_context'),
  !issues.includes('missing_context_fence'),
  !issues.includes('missing_evidence_metadata'),
  !issues.includes('missing_goal_metadata'),
  !issues.includes('missing_prompt_evidence_provenance'),
  !issues.includes('missing_evidence_diagnostics_context'),
  !issues.includes('missing_evidence_plan_context'),
  !issues.includes('missing_knowledge_version_context'),
  !issues.includes('missing_coverage_status_context'),
  !issues.includes('missing_goal_coverage_context'),
  !issues.includes('missing_response_plan_goal_context'),
  !issues.includes('missing_goal_plan_context'),
  !issues.includes('missing_anchor_metadata_context'),
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
 const allowClarification=analyzeReadingQuestion(question).confidence!=='focused';
 let parsed=null,relaxed=null;
 try{
  const routing=analyzeReadingQuestion(question);
  const evidenceMeta=summarizeReadingEvidence(retrieval.evidence,cards,{themes:routing.themes,goals:routing.goals});
  const requiresCoverageBoundary=evidenceMeta.coverageStatus==='anchor_only'||evidenceMeta.missingGoalCoverage.length>0;
  parsed=parseReadingOutput(output,{cards,evidence:retrieval.evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireReferenceSupport:true,requireCardReadingSupport:true,requireConcreteActions:true,requireActionReasons:true,requireActionReasonSupport:true,requireTextSupport:true,requireSynthesis:true,requireSynthesisSupport:true,requireSynthesisCardSupport:true,requireSynthesisAnchors:true,requireUncertainty:true,requireRealityBoundary:requiresProfessionalBoundary(question),requireCoverageBoundary:requiresCoverageBoundary,requireCalibratedLanguage:true,allowClarification});
 }catch{
  issues.push('output_contract');
  try{relaxed=parseReadingOutput(output,{cards,evidence:retrieval.evidence,requireCoverage:false});}catch{}
 }
 const inspected=parsed??relaxed;
 if(inspected?.needsClarification===true){
  const hasClarification=typeof inspected.clarification==='string'&&inspected.clarification.trim().length>0;
  if(!hasClarification)issues.push('missing_clarification');
  const uniqueIssues=[...new Set(issues)];
  const checks=[retrieval.ok,parsed!==null,hasClarification];
  return {ok:uniqueIssues.length===0,score:scoreChecks(checks),issues:uniqueIssues,parsed,retrieval};
 }
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
