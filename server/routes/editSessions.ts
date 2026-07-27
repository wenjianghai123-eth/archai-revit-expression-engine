import { Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import { apiError, apiOk } from '../http';
import { enqueueGenerationJob, isGenerationWorkerDisabled } from '../generationService';
import {
  adjustCredits, createAssetVersion, createEditMessage, createEditSession, createGenerationJob, getAssetVersion, getEditSession,
  getEditMessageByClientRequest, getGenerationJob, getImageAsset, getProject, listAssetVersions, listEditMessages, updateEditMessage, updateEditSession,
  listEditSessions, updateAssetVersion, updateGenerationJob,
} from '../storage';
import { getGenerationCreditCost } from '../../src/utils/generationCredits';
import { compileContinuousEditPrompt } from '../prompts/continuousEditPrompt';

const allowedImageSizes = new Set(['512', '1K', '2K', '4K']);

export function createEditSessionsRouter(): Router {
  const router = Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const user = getRequiredCurrentUser(req);
      const projectId = readString(req.query.projectId);
      const sessions = await listEditSessions(user.id, projectId || null);
      const details = await Promise.all(sessions.map(async session => ({
        session,
        versions: await listAssetVersions(session.id, user.id),
        messages: await listEditMessages(session.id, user.id),
      })));
      res.json(apiOk({ sessions: details }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const user = getRequiredCurrentUser(req); const body = asRecord(req.body);
      const sourceAssetId = readString(body.sourceAssetId);
      if (!sourceAssetId) return void res.status(400).json(apiError('sourceAssetId is required.', 'EDIT_SESSION_SOURCE_REQUIRED'));
      const sourceAsset = await getImageAsset(sourceAssetId, user.id);
      if (!sourceAsset) return void res.status(404).json(apiError('Source image asset not found.', 'EDIT_SESSION_SOURCE_NOT_FOUND'));
      const projectId = readString(body.projectId) || null;
      if (projectId && !(await getProject(projectId, user.id))) return void res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      const result = await createEditSession({ userId:user.id, projectId, sourceAssetId, title:readString(body.title)||'连续编辑', permanentConstraints:asRecord(body.permanentConstraints), aspectRatio:readString(body.aspectRatio)||null }, sourceAsset);
      console.info({event:'edit_session_created',sessionId:result.session.id,userId:user.id,baseVersionId:result.version.id,outputVersionId:null,provider:null,model:null});
      res.status(201).json(apiOk({session:result.session,version:result.version,versions:[result.version],messages:[]}));
    } catch (error) {
      if (isEditSchemaMissing(error)) {
        console.error('[continuous-edit] database schema missing', { error: error instanceof Error ? error.message : String(error) });
        return void res.status(503).json(apiError('连续修改数据表尚未创建，请先执行 Supabase migration 20260714000000_create_continuous_editing.sql。','EDIT_SCHEMA_NOT_READY'));
      }
      next(error);
    }
  });

  router.get('/:sessionId', requireAuth, async (req,res,next) => { try { const user=getRequiredCurrentUser(req);const session=await getEditSession(req.params.sessionId,user.id);if(!session)return void res.status(404).json(apiError('Edit session not found.','EDIT_SESSION_NOT_FOUND'));res.json(apiOk({session,versions:await listAssetVersions(session.id,user.id),messages:await listEditMessages(session.id,user.id)})); } catch(error){next(error);} });
  router.get('/:sessionId/versions', requireAuth, async (req,res,next) => { try { const user=getRequiredCurrentUser(req);const session=await getEditSession(req.params.sessionId,user.id);if(!session)return void res.status(404).json(apiError('Edit session not found.','EDIT_SESSION_NOT_FOUND'));res.json(apiOk({versions:await listAssetVersions(session.id,user.id)})); } catch(error){next(error);} });

  router.post('/:sessionId/messages', requireAuth, async (req,res,next) => {
    try {
      const user=getRequiredCurrentUser(req);const session=await getEditSession(req.params.sessionId,user.id);if(!session)return void res.status(404).json(apiError('Edit session not found.','EDIT_SESSION_NOT_FOUND'));
      if(session.status!=='active')return void res.status(409).json(apiError('Edit session is not active.','EDIT_SESSION_NOT_ACTIVE'));
      if(!session.projectId)return void res.status(409).json(apiError('A project is required before generating an edit.','EDIT_SESSION_PROJECT_REQUIRED'));
      const body=asRecord(req.body);const generationKind=readString(body.generationKind)==='final-render'?'final-render':'preview-edit';const instruction=readString(body.instruction)||(generationKind==='final-render'?'基于当前版本生成高清定稿，保持所有设计、结构、材质、灯光、相机和构图不变，仅提升清晰度与细节质量。':undefined);const baseVersionId=readString(body.baseVersionId);const imageSize=readString(body.imageSize)||(generationKind==='final-render'?'2K':'1K');
      const clientRequestId=readString(body.clientRequestId);
      if(!instruction)return void res.status(400).json(apiError('instruction is required.','EDIT_INSTRUCTION_REQUIRED'));
      if(!baseVersionId)return void res.status(400).json(apiError('baseVersionId is required.','EDIT_BASE_VERSION_REQUIRED'));
      if(clientRequestId){const existing=await getEditMessageByClientRequest(session.id,clientRequestId);if(existing?.generationJobId){const existingJob=await getGenerationJob(existing.generationJobId,user.id);return void res.status(200).json(apiOk({sessionId:session.id,message:existing,jobId:existing.generationJobId,status:existingJob?.status||existing.status,creditCost:existingJob?.creditCost||0,idempotent:true}));}}
      if(!allowedImageSizes.has(imageSize))return void res.status(400).json(apiError('imageSize must be 512, 1K, 2K, or 4K.','EDIT_IMAGE_SIZE_INVALID'));
      if(generationKind==='preview-edit'&&imageSize!=='1K')return void res.status(400).json(apiError('Preview edits must use 1K.','EDIT_PREVIEW_SIZE_INVALID'));
      if(generationKind==='final-render'&&imageSize!=='2K'&&imageSize!=='4K')return void res.status(400).json(apiError('Final renders must use 2K or 4K.','EDIT_FINAL_SIZE_INVALID'));
      const baseVersion=await getAssetVersion(baseVersionId,session.id,user.id);if(!baseVersion)return void res.status(404).json(apiError('Base version not found in this session.','EDIT_BASE_VERSION_NOT_FOUND'));
      const originalVersion=await getAssetVersion(session.originalVersionId,session.id,user.id);if(!originalVersion)return void res.status(409).json(apiError('Original V0 is missing.','EDIT_ORIGINAL_VERSION_NOT_FOUND'));
      const referenceAssetIds=readStringArray(body.referenceAssetIds).slice(0,3);const referenceRoles=readReferenceRoles(body.referenceRoles,referenceAssetIds.length);
      for(const assetId of referenceAssetIds){if(!(await getImageAsset(assetId,user.id)))return void res.status(404).json(apiError('Reference image asset not found.','EDIT_REFERENCE_ASSET_NOT_FOUND'));}
      const maskAssetId=readString(body.maskAssetId);if(maskAssetId&&!(await getImageAsset(maskAssetId,user.id)))return void res.status(404).json(apiError('Mask image asset not found.','EDIT_MASK_ASSET_NOT_FOUND'));
      const message=await createEditMessage({sessionId:session.id,role:'user',content:instruction,baseVersionId,status:'queued',clientRequestId:clientRequestId||null});
      const temporaryConstraints=asRecord(body.constraints);
      const compiledPrompt=compileContinuousEditPrompt({instruction,permanentConstraints:session.permanentConstraints,temporaryConstraints,featureType:generationKind==='final-render'?'continuous-image-final-render':readString(body.featureType)||'continuous-image-edit',currentVersion:{id:baseVersion.id,versionNumber:baseVersion.versionNumber},includesOriginalStructureReference:true,referenceImageRoles:referenceRoles,hasMask:Boolean(maskAssetId)});
      const provider='apiyi'; const model='nano-banana2';
      const config={step:'style_render',generationStep:'style_render',sourceImageAssetId:baseVersion.assetId,originalStructureAssetId:originalVersion.assetId,continuousEditReferenceAssetIds:referenceAssetIds,continuousEditReferenceRoles:referenceRoles,apiyiImageSize:imageSize,aspectRatio:session.aspectRatio||undefined,editSessionId:session.id,editMessageId:message.id,baseVersionId,generationKind,maskMode:maskAssetId?'asset-mask':undefined,maskAssetId,compiledPrompt,permanentConstraints:session.permanentConstraints,temporaryConstraints,model};
      const creditCost=getGenerationCreditCost('style-render',config);
      const job=await createGenerationJob({userId:user.id,projectId:session.projectId,mode:'style-render',step:'style_render',prompt:compiledPrompt,config,inputAssetIds:[baseVersion.assetId,originalVersion.assetId,...referenceAssetIds,...(maskAssetId?[maskAssetId]:[])],provider,creditCost});
      if(!job) return void res.status(404).json(apiError('Project not found.','PROJECT_NOT_FOUND'));
      await updateEditMessage(message.id,{generationJobId:job.id});
      let debit:Awaited<ReturnType<typeof adjustCredits>>;
      try { debit=await adjustCredits({userId:user.id,type:'generate_charge',amount:-creditCost,reason:'Continuous image edit',referenceType:'generation_job',referenceId:job.id}); }
      catch(error){const errorMessage=error instanceof Error?error.message:'Credit debit failed.';await updateGenerationJob(job.id,{status:'cancelled',failureReason:errorMessage,finishedAt:new Date().toISOString()});await updateEditMessage(message.id,{status:'cancelled',errorCode:'CREDIT_DEBIT_FAILED',errorMessage});throw error;}
      if(!debit){await updateGenerationJob(job.id,{status:'cancelled',failureReason:'Credits are insufficient.',finishedAt:new Date().toISOString()});await updateEditMessage(message.id,{status:'cancelled',errorCode:'CREDITS_INSUFFICIENT',errorMessage:'算力点不足，请充值或联系管理员。'});return void res.status(402).json(apiError('Credits are insufficient.','CREDITS_INSUFFICIENT'));}
      if(!isGenerationWorkerDisabled())enqueueGenerationJob(job.id);
      console.info({event:'edit_message_queued',sessionId:session.id,messageId:message.id,jobId:job.id,userId:user.id,baseVersionId,outputVersionId:null,provider,model});
      res.status(202).json(apiOk({sessionId:session.id,message:{...message,generationJobId:job.id},jobId:job.id,status:'queued',creditCost}));
    } catch(error){next(error);}
  });

  router.post('/:sessionId/select-version',requireAuth,async(req,res,next)=>{try{const user=getRequiredCurrentUser(req);const session=await getEditSession(req.params.sessionId,user.id);if(!session)return void res.status(404).json(apiError('Edit session not found.','EDIT_SESSION_NOT_FOUND'));const versionId=readString(asRecord(req.body).versionId);if(!versionId||!(await getAssetVersion(versionId,session.id,user.id)))return void res.status(404).json(apiError('Version not found in this session.','EDIT_VERSION_NOT_FOUND'));const updated=await updateEditSession(session.id,user.id,{currentVersionId:versionId});res.json(apiOk({session:updated,currentVersionId:versionId}));}catch(error){next(error);}});

  router.patch('/:sessionId/versions/:versionId', requireAuth, async (req, res, next) => {
    try {
      const user = getRequiredCurrentUser(req);
      const session = await getEditSession(req.params.sessionId, user.id);
      if (!session) return void res.status(404).json(apiError('Edit session not found.', 'EDIT_SESSION_NOT_FOUND'));
      const version = await getAssetVersion(req.params.versionId, session.id, user.id);
      if (!version) return void res.status(404).json(apiError('Version not found in this session.', 'EDIT_VERSION_NOT_FOUND'));
      const body = asRecord(req.body);
      const displayName = readNullableString(body.displayName);
      const note = readNullableString(body.note);
      if (displayName === undefined && note === undefined) {
        return void res.status(400).json(apiError('displayName or note is required.', 'EDIT_VERSION_UPDATE_REQUIRED'));
      }
      const updated = await updateAssetVersion(version.id, session.id, user.id, {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(note !== undefined ? { note: note || '' } : {}),
      });
      res.json(apiOk({ version: updated }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:sessionId/versions/:versionId/set-primary', requireAuth, async (req, res, next) => {
    try {
      const { session, version, userId } = await requireOwnedVersion(req.params.sessionId, req.params.versionId, req);
      if (!session || !version || !userId) return void res.status(404).json(apiError('Version not found in this session.', 'EDIT_VERSION_NOT_FOUND'));
      const updated = await updateEditSession(session.id, userId, { primaryVersionId: version.id });
      res.json(apiOk({ session: updated, primaryVersionId: version.id }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:sessionId/versions/:versionId/set-final', requireAuth, async (req, res, next) => {
    try {
      const { session, version, userId } = await requireOwnedVersion(req.params.sessionId, req.params.versionId, req);
      if (!session || !version || !userId) return void res.status(404).json(apiError('Version not found in this session.', 'EDIT_VERSION_NOT_FOUND'));
      const updated = await updateEditSession(session.id, userId, {
        finalVersionId: version.id,
      });
      res.json(apiOk({ session: updated, finalVersionId: version.id }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:sessionId/versions/:versionId/restore', requireAuth, async (req, res, next) => {
    try {
      const { session, version, userId } = await requireOwnedVersion(req.params.sessionId, req.params.versionId, req);
      if (!session || !version || !userId) return void res.status(404).json(apiError('Version not found in this session.', 'EDIT_VERSION_NOT_FOUND'));
      const versions = await listAssetVersions(session.id, userId);
      const restored = await createAssetVersion({
        assetId: version.assetId,
        sessionId: session.id,
        parentVersionId: version.id,
        restoredFromVersionId: version.id,
        versionNumber: versions.reduce((max, item) => Math.max(max, item.versionNumber), -1) + 1,
        displayName: `恢复自 V${version.versionNumber}`,
        note: version.note || '',
        storagePath: version.storagePath,
        publicUrl: version.publicUrl,
        userInstruction: `恢复到 V${version.versionNumber}`,
        compiledPrompt: '',
        provider: null,
        model: null,
        generationJobId: null,
        createdBy: userId,
        exportedAt: null,
      });
      const updated = await updateEditSession(session.id, userId, {
        currentVersionId: restored.id,
        status: 'active',
      });
      console.info({
        event: 'edit_version_restored',
        sessionId: session.id,
        userId,
        baseVersionId: version.id,
        outputVersionId: restored.id,
      });
      res.status(201).json(apiOk({ session: updated, version: restored }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:sessionId/versions/:versionId/exported', requireAuth, async (req, res, next) => {
    try {
      const { session, version, userId } = await requireOwnedVersion(req.params.sessionId, req.params.versionId, req);
      if (!session || !version || !userId) return void res.status(404).json(apiError('Version not found in this session.', 'EDIT_VERSION_NOT_FOUND'));
      const updated = await updateAssetVersion(version.id, session.id, userId, {
        exportedAt: new Date().toISOString(),
      });
      res.json(apiOk({ version: updated }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:sessionId/finalize', requireAuth, async (req, res, next) => {
    try {
      const user = getRequiredCurrentUser(req);
      const session = await getEditSession(req.params.sessionId, user.id);
      if (!session) return void res.status(404).json(apiError('Edit session not found.', 'EDIT_SESSION_NOT_FOUND'));
      const requestedVersionId = readString(asRecord(req.body).versionId) || session.currentVersionId;
      const version = await getAssetVersion(requestedVersionId, session.id, user.id);
      if (!version) return void res.status(404).json(apiError('Version not found in this session.', 'EDIT_VERSION_NOT_FOUND'));
      const updated = await updateEditSession(session.id, user.id, {
        status: 'finalized',
        finalVersionId: version.id,
      });
      res.json(apiOk({ session: updated, finalVersionId: version.id }));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

function asRecord(value:unknown):Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function readString(value:unknown):string|undefined{return typeof value==='string'&&value.trim()?value.trim():undefined;}
function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() : undefined;
}
function readStringArray(value:unknown):string[]{return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&Boolean(item.trim())).map(item=>item.trim()):[];}
function readReferenceRoles(value:unknown,count:number):string[]{const roles=readStringArray(value);return Array.from({length:count},(_,index)=>roles[index]||'style');}
function isEditSchemaMissing(error:unknown):boolean{const message=error instanceof Error?error.message:String(error);return /PGRST205|42P01|edit_sessions|edit_messages|asset_versions/iu.test(message)&&/not find|does not exist|schema cache|relation/iu.test(message);}

async function requireOwnedVersion(sessionId: string, versionId: string, req: Parameters<typeof getRequiredCurrentUser>[0]) {
  const user = getRequiredCurrentUser(req);
  const session = await getEditSession(sessionId, user.id);
  if (!session) return { session: null, version: null, userId: user.id };
  const version = await getAssetVersion(versionId, session.id, user.id);
  return { session, version, userId: user.id };
}
