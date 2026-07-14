import { createAssetVersion, getAssetVersion, getEditMessage, getEditSession, getImageAsset, listAssetVersions, listGenerationResults, updateEditMessage, updateEditSession, type GenerationJob } from './storage';

export async function markEditGenerationRunning(job: GenerationJob): Promise<void> {
  const messageId=readConfigString(job,'editMessageId'); if(messageId) await updateEditMessage(messageId,{status:'running'});
}

export async function completeEditGeneration(job: GenerationJob, outputAssetId: string): Promise<void> {
  const sessionId=readConfigString(job,'editSessionId'); const messageId=readConfigString(job,'editMessageId'); const baseVersionId=readConfigString(job,'baseVersionId');
  if(!sessionId||!messageId||!baseVersionId)return;
  const session=await getEditSession(sessionId,job.userId);const message=await getEditMessage(messageId);const baseVersion=await getAssetVersion(baseVersionId,sessionId,job.userId);const asset=await getImageAsset(outputAssetId,job.userId);
  if(!session||!message||message.sessionId!==sessionId||!baseVersion||!asset)throw new Error('Continuous edit lifecycle references are invalid.');
  const versions=await listAssetVersions(sessionId,job.userId);const results=await listGenerationResults(job.id,job.userId);const model=job.diagnostics?.provider?.model||job.diagnostics?.provider?.providerModel||null;
  const version=message.outputVersionId?versions.find(item=>item.id===message.outputVersionId):versions.find(item=>item.generationJobId===job.id)
    || await createAssetVersion({assetId:asset.id,sessionId,parentVersionId:baseVersion.id,versionNumber:versions.reduce((max,item)=>Math.max(max,item.versionNumber),-1)+1,storagePath:asset.path||asset.filename,publicUrl:asset.publicUrl||asset.url,userInstruction:message.content,compiledPrompt:job.prompt,provider:job.provider,model,generationJobId:job.id,createdBy:job.userId});
  if(!version)throw createLifecycleError('EDIT_OUTPUT_VERSION_MISSING','Output version could not be recovered.');
  await updateEditMessage(message.id,{outputVersionId:version.id,generationJobId:job.id,status:'succeeded',errorCode:null,errorMessage:null});await updateEditSession(session.id,job.userId,{currentVersionId:version.id});
  console.info({event:'edit_version_created',sessionId,messageId:message.id,jobId:job.id,userId:job.userId,baseVersionId,outputVersionId:version.id,provider:job.provider,model,generationResultId:results[0]?.id});
}

export async function failEditGeneration(job: GenerationJob, status: 'failed'|'cancelled'|'timeout', errorCode?:string, errorMessage?:string): Promise<void> {
  const messageId=readConfigString(job,'editMessageId');if(!messageId)return;await updateEditMessage(messageId,{generationJobId:job.id,status,errorCode:errorCode||status.toUpperCase(),errorMessage:errorMessage||job.failureReason||job.errorMessage||status});
  console.info({event:'edit_generation_terminal',sessionId:readConfigString(job,'editSessionId'),messageId,jobId:job.id,userId:job.userId,baseVersionId:readConfigString(job,'baseVersionId'),outputVersionId:null,provider:job.provider,model:job.diagnostics?.provider?.model||null,status});
}

function readConfigString(job:GenerationJob,key:string):string|undefined{const value=job.config[key];return typeof value==='string'&&value.trim()?value:undefined;}
function createLifecycleError(code:string,message:string){const error=new Error(message) as Error&{code:string};error.code=code;return error;}
