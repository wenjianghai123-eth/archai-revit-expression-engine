import { useCallback, useEffect, useRef, useState } from 'react';
import { createEditMessage, getEditSession, getGenerationJob, selectEditVersion, type EditSessionDetail } from '../lib/api';
import type { EditConstraint, EditJobState } from '../types';

export interface SendEditInput {
  instruction: string;
  baseVersionId: string;
  imageSize: '1K' | '2K' | '4K';
  generationKind: 'preview-edit' | 'final-render';
  maskAssetId?: string;
  constraints: Partial<Record<EditConstraint, boolean>>;
  clientRequestId?: string;
}

export function useImageEditSession(initial: EditSessionDetail, refreshCredits: () => Promise<void>) {
  const [detail,setDetail]=useState(initial);const [selectedVersionId,setSelectedVersionId]=useState(initial.session.currentVersionId);const [jobState,setJobState]=useState<EditJobState|null>(null);const mounted=useRef(true);const submitting=useRef(false);
  useEffect(()=>()=>{mounted.current=false;},[]);
  const refresh=useCallback(async()=>{const next=await getEditSession(detail.session.id);if(mounted.current)setDetail(next);return next;},[detail.session.id]);
  const chooseVersion=useCallback((versionId:string)=>setSelectedVersionId(versionId),[]);
  const makeCurrent=useCallback(async(versionId:string)=>{const result=await selectEditVersion(detail.session.id,versionId);if(mounted.current){setDetail(previous=>({...previous,session:result.session}));setSelectedVersionId(versionId);}},[detail.session.id]);
  useEffect(()=>{const pending=[...initial.messages].reverse().find(message=>(message.status==='queued'||message.status==='running')&&Boolean(message.generationJobId));if(!pending?.generationJobId)return;let cancelled=false;setJobState({jobId:pending.generationJobId,messageId:pending.id,baseVersionId:pending.baseVersionId||initial.session.currentVersionId,instruction:pending.content,imageSize:'1K',generationKind:'preview-edit',constraints:{},status:pending.status,progress:0,error:null});void (async()=>{try{let job=await getGenerationJob(pending.generationJobId!);const started=Date.now();while(!cancelled&&(job.status==='queued'||job.status==='running')){setJobState(previous=>previous?{...previous,status:job.status,progress:job.progress}:previous);await delay(readPollDelay(Date.now()-started));job=await getGenerationJob(pending.generationJobId!);}if(cancelled)return;if(job.status!=='succeeded')throw new Error(`${job.diagnostics?.provider?.providerError||job.status.toUpperCase()}: ${job.errorMessage||job.failureReason||'生成失败'}`);const next=await refresh();const output=next.versions.find(version=>version.generationJobId===job.id);setSelectedVersionId(output?.id||next.session.currentVersionId);setJobState(previous=>previous?{...previous,status:'succeeded',progress:100,error:null}:previous);await refreshCredits();}catch(error){if(cancelled)return;setJobState(previous=>previous?{...previous,status:'failed',error:error instanceof Error?error.message:'生成失败'}:previous);await refresh().catch(()=>undefined);await refreshCredits();}})();return()=>{cancelled=true;};},[initial.messages,initial.session.currentVersionId,refresh,refreshCredits]);
  const send=useCallback(async(input:SendEditInput)=>{
    if(submitting.current)return;submitting.current=true;const requestInput={...input,clientRequestId:input.clientRequestId||crypto.randomUUID()};
    try{const response=await createEditMessage(detail.session.id,requestInput);const initialJob:EditJobState={jobId:response.jobId,messageId:response.message.id,baseVersionId:input.baseVersionId,instruction:input.instruction,imageSize:input.imageSize,generationKind:input.generationKind,maskAssetId:input.maskAssetId,constraints:input.constraints,status:'queued',progress:0,error:null};if(mounted.current)setJobState(initialJob);let job=await getGenerationJob(response.jobId);const started=Date.now();while(job.status==='queued'||job.status==='running'){if(!mounted.current)return;setJobState(previous=>previous?{...previous,status:job.status,progress:job.progress}:previous);if(Date.now()-started>10*60*1000)throw new Error('生成时间较长，请稍后重试或重新打开会话。');await delay(readPollDelay(Date.now()-started));job=await getGenerationJob(response.jobId);}if(job.status!=='succeeded'){const code=job.diagnostics?.provider?.providerError||job.status.toUpperCase();throw new Error(`${code}: ${job.errorMessage||job.failureReason||'生成失败，请重试。'}`);}const next=await refresh();const output=next.versions.find(version=>version.generationJobId===job.id);if(mounted.current){setSelectedVersionId(output?.id||next.session.currentVersionId);setJobState(previous=>previous?{...previous,status:'succeeded',progress:100,error:null}:previous);}await refreshCredits();}
    catch(error){const message=error instanceof Error?error.message:'生成失败，请重试。';if(mounted.current)setJobState(previous=>previous?{...previous,status:'failed',error:message}:previous);await refresh().catch(()=>undefined);await refreshCredits();}
    finally{submitting.current=false;}
  },[detail.session.id,refresh,refreshCredits]);
  return {detail,selectedVersionId,selectedVersion:detail.versions.find(version=>version.id===selectedVersionId)||detail.versions[0],jobState,isGenerating:jobState?.status==='queued'||jobState?.status==='running',chooseVersion,makeCurrent,send,refresh};
}

function delay(ms:number){return new Promise(resolve=>window.setTimeout(resolve,ms));}
function readPollDelay(elapsed:number){if(elapsed<10_000)return 1_000;if(elapsed<120_000)return 2_500;return 5_000;}
