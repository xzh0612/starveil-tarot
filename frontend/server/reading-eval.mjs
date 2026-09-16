import {analyzeReadingQuestion,canAskClarification,parseReadingOutput,requiresProfessionalBoundary,retrieveReadingEvidence,summarizeReadingEvidence} from './reading-rag.mjs';

const ACTION_WORDS=/建议|可以|先|尝试|记录|核实|安排|沟通|复盘|拆分|设定|观察|练习|下一步/u;

function scoreChecks(checks){
 const passed=checks.filter(Boolean).length;
 return Math.round((passed/checks.length)*100);
}

/**
 * Deterministic retrieval regression rubric. This checks grounding coverage,
 * not whether a symbolic interpretation is objectively true.
 */
export function evaluateRetrievalCase({question,cards,requiredKinds=[],requiredPositionKinds=[]}={}){
 const evidence=retrieveReadingEvidence({question,cards});
 const kinds=new Set(evidence.map(item=>item.kind));
 const missingKinds=[...new Set(requiredKinds)].filter(kind=>!kinds.has(kind));
 const positionKinds=new Set(evidence.flatMap(item=>Array.isArray(item.retrievalPositionKinds)?item.retrievalPositionKinds:[]));
 const missingPositionKinds=[...new Set(requiredPositionKinds)].filter(kind=>!positionKinds.has(kind));
 const missingCards=(cards??[]).filter(card=>!evidence.some(item=>item.cardId===card?.id&&item.kind==='orientation')).map(card=>card?.id).filter(Boolean);
 const issues=[
  ...missingKinds.map(kind=>`missing_evidence:${kind}`),
  ...missingPositionKinds.map(kind=>`missing_position_kind:${kind}`),
  ...missingCards.map(cardId=>`missing_card:${cardId}`),
 ];
 const checks=[evidence.length>0,missingKinds.length===0,missingPositionKinds.length===0,missingCards.length===0];
 return {ok:issues.length===0,score:scoreChecks(checks),issues,missingKinds,positionKinds:[...positionKinds],missingPositionKinds,missingCards,evidence};
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
 if(!/evidencePlan[^\n]{0,900}positionEvidenceIds[^\n]{0,600}(?:必须|优先)/i.test(system))issues.push('missing_position_evidence_rule');
 if(!/coverageStatus/i.test(system))issues.push('missing_coverage_status');
 if(!/missingApplicationKindsByCard/i.test(system))issues.push('missing_application_domain_diagnostics');
 if(!/goalCoverage/i.test(system)||!/missingGoalCoverage/i.test(system))issues.push('missing_goal_coverage_rule');
 if(!/responsePlan[^\n]{0,500}(?:goal|emphasis)/i.test(system))issues.push('missing_response_plan_goal_rule');
 if(!/goalPlan[^\n]{0,700}(?:order|evidenceIds|逐一回应)/i.test(system))issues.push('missing_goal_plan_rule');
 if(!/goalSections[^\n]{0,700}(?:目标|goal|分段|evidenceIds)/i.test(system))issues.push('missing_goal_sections_rule');
 if(!/synthesis[^\n]{0,900}(?:多牌阵|每张牌|分别|逐张)[^\n]{0,300}(?:核心|概念|证据)/i.test(system))issues.push('missing_synthesis_per_card_rule');
 if(!/<starveil_workflow>[\s\S]*?(?:activeQuestion|逐牌解读)[\s\S]*?(?:synthesis|合读)[\s\S]*?(?:自检|自查)[\s\S]*?<\/starveil_workflow>/i.test(system))issues.push('missing_prompt_workflow');
 if(!/claim|引用说明/i.test(system))issues.push('missing_claim_support');
 if(!/(?:逐句都能被该证据支持的简短 claim|claim[^\n]{0,180}(?:逐句|每句)[^\n]{0,180}(?:证据|evidence))/i.test(system))issues.push('missing_claim_sentence_support_rule');
 if(!/(?:保证|必然|绝对|断言)[^\n]{0,500}(?:goalSections|actions|references|用户可见)/i.test(system))issues.push('missing_calibration_rule');
 if(!/synthesis[^\n]{0,600}(?:核心锚点|retrievalRequired)/i.test(system))issues.push('missing_synthesis_anchor_rule');
 if(!/澄清分支[^\n]{0,300}(?:必须为空|不得同时返回)/u.test(system))issues.push('missing_clarification_exclusivity');
 if(!/action[^\n]{0,600}(?:reason|理由)[^\n]{0,300}(?:必须|非空|说明)/i.test(system))issues.push('missing_action_reason_rule');
 if(!/action[^\n]{0,900}(?:reason|理由)[^\n]{0,900}(?:证据|evidence)/i.test(system))issues.push('missing_action_reason_support_rule');
 if(!/首轮每条 action 的正文和 reason (?:(?:都必须(?:分别)?与)|(?:也必须逐句(?:、逐个分句)?与))(?:其 evidenceIds 的证据|所引 evidence)\s*共享具体、非通用概念/i.test(system))issues.push('missing_action_specific_reason_rule');
 if(!/action[^\n]{0,900}(?:正文|内容)[^\n]{0,900}(?:证据|evidence)/i.test(system))issues.push('missing_action_text_support_rule');
 if(!/首轮每条 action 的正文和 reason (?:(?:都必须(?:分别)?与)|(?:也必须逐句(?:、逐个分句)?与))(?:其 evidenceIds 的证据|所引 evidence)\s*共享具体、非通用概念/i.test(system))issues.push('missing_action_specific_text_rule');
 if(!/追问返回 actions，其正文的每个实质句和逗号分句必须与 action\.evidenceIds 的证据共享具体、非通用概念，reason 若提供也必须逐句、逐个分句被同一组证据支持/u.test(system))issues.push('missing_followup_action_support_rule');
 if(!/(?:goalSections、cardReadings、synthesis 的正文都必须分别复述所引 evidence 中的(?:具体、非通用|非通用)概念|只要返回 goalSections、cardReadings 或 synthesis，即使是单目标或结构化追问，(?:其中)?每个实质句都必须与所引 evidence 共享具体、非通用概念|只要返回 goalSections、cardReadings 或 synthesis，即使是单目标或结构化追问，正文也必须分别复述所引 evidence 中的(?:具体、非通用|非通用)概念)/i.test(system))issues.push('missing_structured_specific_support_rule');
 if(!/首轮 goalSections 还必须优先使用该目标的 requiredEvidenceTier/i.test(system))issues.push('missing_goal_section_tier_rule');
 if(!/结构化追问若本轮有明确 goal，也必须在 references 或对应 goalSections 中优先引用该目标的 requiredEvidenceTier/u.test(system))issues.push('missing_followup_goal_tier_rule');
 if(!/advice 或 comparison 目标有可用 application 证据时，每条首轮 action 至少引用一个对应目标的 application ID/u.test(system))issues.push('missing_action_goal_evidence_rule');
 if(!/text[^\n]{0,700}(?:正文|内容)[^\n]{0,700}(?:证据|evidence)/i.test(system))issues.push('missing_text_support_rule');
 if(!/(?:text 正文(?:也)?必须与(?:本轮引用|所引) evidence 共享具体、非通用概念|text 正文的每个实质句都必须与本轮引用 evidence 共享具体、非通用概念)/i.test(system))issues.push('missing_text_specific_support_rule');
 if(!/逗号、顿号和常见转折\/并列\/因果连接词分句也必须分别与所引 evidence 共享具体、非通用概念，不得在已命中的分句后追加证据之外的事实/u.test(system))issues.push('missing_clause_support_rule');
 if(!/首轮 text 的关键判断必须能在 references 或 goalSections 的 evidenceIds 中找到/i.test(system))issues.push('missing_text_reference_scope_rule');
 if(!/mixed 模式的 text（首轮必须，追问若返回多个 goalSections 也必须）还必须分别复述每个 goalSections 目标至少一个具体概念，不能只覆盖其中一个目标/i.test(system))issues.push('missing_mixed_text_goal_coverage_rule');
 if(!/anchor_only[^\n]{0,500}(?:证据|资料)[^\n]{0,500}(?:不足|限制|不确定)/i.test(system))issues.push('missing_coverage_boundary_rule');
 if(!/retrievalRequired/i.test(system))issues.push('missing_anchor_metadata');
 if(!/question|cards|evidence/i.test(user)||!/question/i.test(user)||!/cards/i.test(user)||!/evidence/i.test(user))issues.push('missing_grounded_context');
 if(!/<starveil_context>[\s\S]*<\/starveil_context>/.test(user))issues.push('missing_context_fence');
 if(!/tier|retrievalReasons/.test(user))issues.push('missing_evidence_metadata');
 if(!/goal|目标/i.test(user))issues.push('missing_goal_metadata');
 if(!/sourceType|sourceLabel/.test(user)||!/retrievalRequired/.test(user))issues.push('missing_prompt_evidence_provenance');
 if(!/evidenceMeta/.test(user))issues.push('missing_evidence_diagnostics_context');
 if(!/evidencePlan/.test(user))issues.push('missing_evidence_plan_context');
 if(!/positionEvidenceIds/.test(user))issues.push('missing_position_evidence_context');
 if(!/knowledgeMeta/.test(user))issues.push('missing_knowledge_version_context');
 if(!/coverageStatus/.test(user))issues.push('missing_coverage_status_context');
 if(!/missingApplicationKindsByCard/.test(user))issues.push('missing_application_domain_diagnostics_context');
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
  !issues.includes('missing_position_evidence_rule'),
  !issues.includes('missing_coverage_status'),
  !issues.includes('missing_application_domain_diagnostics'),
  !issues.includes('missing_goal_coverage_rule'),
  !issues.includes('missing_response_plan_goal_rule'),
  !issues.includes('missing_goal_plan_rule'),
  !issues.includes('missing_goal_sections_rule'),
  !issues.includes('missing_synthesis_per_card_rule'),
  !issues.includes('missing_prompt_workflow'),
  !issues.includes('missing_claim_support'),
  !issues.includes('missing_claim_sentence_support_rule'),
  !issues.includes('missing_calibration_rule'),
  !issues.includes('missing_synthesis_anchor_rule'),
  !issues.includes('missing_clarification_exclusivity'),
  !issues.includes('missing_action_reason_rule'),
  !issues.includes('missing_action_reason_support_rule'),
  !issues.includes('missing_action_specific_reason_rule'),
  !issues.includes('missing_action_text_support_rule'),
  !issues.includes('missing_action_specific_text_rule'),
  !issues.includes('missing_followup_action_support_rule'),
  !issues.includes('missing_structured_specific_support_rule'),
  !issues.includes('missing_goal_section_tier_rule'),
  !issues.includes('missing_followup_goal_tier_rule'),
  !issues.includes('missing_action_goal_evidence_rule'),
  !issues.includes('missing_text_support_rule'),
  !issues.includes('missing_text_specific_support_rule'),
  !issues.includes('missing_clause_support_rule'),
  !issues.includes('missing_text_reference_scope_rule'),
  !issues.includes('missing_mixed_text_goal_coverage_rule'),
  !issues.includes('missing_coverage_boundary_rule'),
  !issues.includes('missing_anchor_metadata'),
  !issues.includes('missing_grounded_context'),
  !issues.includes('missing_context_fence'),
  !issues.includes('missing_evidence_metadata'),
  !issues.includes('missing_goal_metadata'),
  !issues.includes('missing_prompt_evidence_provenance'),
  !issues.includes('missing_evidence_diagnostics_context'),
  !issues.includes('missing_evidence_plan_context'),
  !issues.includes('missing_position_evidence_context'),
  !issues.includes('missing_knowledge_version_context'),
  !issues.includes('missing_coverage_status_context'),
  !issues.includes('missing_application_domain_diagnostics_context'),
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
 const allowClarification=canAskClarification(analyzeReadingQuestion(question));
 let parsed=null,relaxed=null;
 try{
  const routing=analyzeReadingQuestion(question);
  const evidenceMeta=summarizeReadingEvidence(retrieval.evidence,cards,{themes:routing.themes,goals:routing.goals});
  const requiresCoverageBoundary=evidenceMeta.coverageStatus==='anchor_only'||evidenceMeta.missingGoalCoverage.length>0;
  const requiredGoalEvidence=routing.goals.filter(goal=>evidenceMeta.goalCoverage[goal]?.ok);
  const requiredActionGoalEvidence=routing.goals.filter(goal=>['advice','comparison'].includes(goal)&&evidenceMeta.goalCoverage[goal]?.ok);
  const requireGoalSections=routing.goals.length>1;
  parsed=parseReadingOutput(output,{cards,evidence:retrieval.evidence,requiredGoalEvidence,requireGoalReferenceCoverage:true,requiredActionGoalEvidence,allowedGoalSections:routing.goals,requiredGoalSections:requireGoalSections?routing.goals:[],requireGoalSections,requireGoalTextCoverage:requireGoalSections,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireReferenceSupport:true,requireCardReadingSupport:true,requireConcreteActions:true,requireActionReasons:true,requireActionReasonSupport:true,requireActionTextSupport:true,requireTextSupport:true,requireSynthesis:true,requireSynthesisSupport:true,requireSynthesisCardSupport:true,requireSynthesisAnchors:true,requirePositionEvidence:true,requireUncertainty:true,requireRealityBoundary:requiresProfessionalBoundary(question),requireCoverageBoundary:requiresCoverageBoundary,requireCalibratedLanguage:true,allowClarification});
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

/**
 * Runs the same grounded parser contract for a structured follow-up. The
 * follow-up path intentionally omits first-reading coverage requirements, but
 * keeps goal-tier citations, claim support, calibration, and evidence limits.
 */
export function evaluateFollowupFixture({question,cards,output,requiredKinds=[]}={}){
 const retrieval=evaluateRetrievalCase({question,cards,requiredKinds});
 const routing=analyzeReadingQuestion(question);
 const evidenceMeta=summarizeReadingEvidence(retrieval.evidence,cards,{themes:routing.themes,goals:routing.goals});
 const requiredGoalEvidence=routing.goals.filter(goal=>evidenceMeta.goalCoverage[goal]?.ok);
 const requiresCoverageBoundary=evidenceMeta.coverageStatus==='anchor_only'||evidenceMeta.missingGoalCoverage.length>0;
 const issues=[...retrieval.issues];let parsed=null;
 try{
  parsed=parseReadingOutput(output,{cards,evidence:retrieval.evidence,requiredGoalEvidence,requireGoalReferenceCoverage:true,allowedGoalSections:routing.goals,requireGoalTextCoverage:routing.goals.length>1,requireReferenceClaims:true,requireReferenceSupport:true,requireCardReadingSupport:true,requireSynthesisSupport:true,requireTextSupport:true,requireRealityBoundary:requiresProfessionalBoundary(question),requireCoverageBoundary:requiresCoverageBoundary,requireCalibratedLanguage:true,allowClarification:true,isFollowUp:true});
 }catch{issues.push('output_contract');}
 const uniqueIssues=[...new Set(issues)],checks=[retrieval.ok,parsed!==null];
 return {ok:uniqueIssues.length===0,score:scoreChecks(checks),issues:uniqueIssues,parsed,retrieval};
}
