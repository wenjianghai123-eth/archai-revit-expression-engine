import { Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import { apiError, apiOk } from '../http';
import {
  createDesignWorkflow,
  createDesignWorkflowNode,
  getActiveDesignWorkflow,
  getDesignWorkflow,
  getDesignWorkflowNode,
  getGenerationJob,
  getImageAsset,
  getProject,
  listDesignWorkflowNodes,
  listGenerationResults,
  updateDesignWorkflow,
  updateDesignWorkflowNode,
  type DesignWorkflow,
  type DesignWorkflowNode,
  type DesignWorkflowStageKey,
} from '../storage';

const workflowStages: DesignWorkflowStageKey[] = [
  'input',
  'base-render',
  'design-variants',
  'material-replace',
  'object-insert',
  'continuous-edit',
  'image-polish',
  'delivery',
];

export function createProjectWorkflowsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const user = getRequiredCurrentUser(req);
      const projectId = req.params.projectId;
      if (!(await getProject(projectId, user.id))) {
        return void res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      }
      const workflow = await getActiveDesignWorkflow(projectId, user.id);
      if (!workflow) return void res.json(apiOk({ workflow: null, nodes: [] }));
      res.json(apiOk({
        workflow,
        nodes: await listDesignWorkflowNodes(workflow.id, projectId, user.id),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const user = getRequiredCurrentUser(req);
      const projectId = req.params.projectId;
      if (!(await getProject(projectId, user.id))) {
        return void res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      }
      const existing = await getActiveDesignWorkflow(projectId, user.id);
      if (existing) {
        return void res.status(200).json(apiOk({
          workflow: existing,
          nodes: await listDesignWorkflowNodes(existing.id, projectId, user.id),
          idempotent: true,
        }));
      }
      const body = asRecord(req.body);
      const inputAssetId = readString(body.inputAssetId);
      if (!inputAssetId || !(await getImageAsset(inputAssetId, user.id))) {
        return void res.status(404).json(apiError(
          'A formal input image asset is required.',
          'DESIGN_WORKFLOW_INPUT_ASSET_REQUIRED',
        ));
      }
      const workflow = await createDesignWorkflow({
        userId: user.id,
        projectId,
        title: readString(body.title) || '设计表达流程',
      });
      const node = await createDesignWorkflowNode(createNodeInput({
        workflowId: workflow.id,
        parentNodeId: null,
        stageKey: 'input',
        status: 'active',
        sourceFeature: readString(body.sourceFeature) || 'project-input',
        inputAssetId,
      }));
      const updated = await updateDesignWorkflow(workflow.id, projectId, user.id, {
        currentNodeId: node.id,
      });
      res.status(201).json(apiOk({ workflow: updated, nodes: [node] }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:workflowId/advance', requireAuth, async (req, res, next) => {
    try {
      const context = await readWorkflowContext(req.params.projectId, req.params.workflowId, req);
      if (!context) {
        return void res.status(404).json(apiError('Design workflow not found.', 'DESIGN_WORKFLOW_NOT_FOUND'));
      }
      const body = asRecord(req.body);
      const stageKey = readStageKey(body.stageKey);
      if (!stageKey) {
        return void res.status(400).json(apiError('stageKey is invalid.', 'DESIGN_WORKFLOW_STAGE_INVALID'));
      }
      const relation = await validateRelation(body, context.workflow.projectId, context.userId);
      if (relation.ok === false) {
        return void res.status(relation.status).json(apiError(relation.message, relation.code));
      }
      const current = context.workflow.currentNodeId
        ? await getDesignWorkflowNode(
            context.workflow.currentNodeId,
            context.workflow.id,
            context.workflow.projectId,
            context.userId,
          )
        : null;
      if (current) {
        await updateDesignWorkflowNode(current.id, {
          status: 'completed',
          ...(relation.parentJobId ? { outputJobId: relation.parentJobId } : {}),
          ...(relation.parentResultId ? { outputResultId: relation.parentResultId } : {}),
          ...(relation.inputAssetId ? { outputAssetId: relation.inputAssetId } : {}),
        });
      }
      let parentNodeId = current?.id || null;
      const currentStageIndex = current ? workflowStages.indexOf(current.stageKey) : -1;
      const targetStageIndex = workflowStages.indexOf(stageKey);
      if (targetStageIndex > currentStageIndex + 1) {
        for (const skippedStage of workflowStages.slice(currentStageIndex + 1, targetStageIndex)) {
          const skippedNode = await createDesignWorkflowNode(createNodeInput({
            workflowId: context.workflow.id,
            parentNodeId,
            stageKey: skippedStage,
            status: 'skipped',
            sourceFeature: current?.stageKey || readString(body.sourceFeature) || null,
            inputAssetId: relation.inputAssetId,
            parentJobId: relation.parentJobId,
            parentResultId: relation.parentResultId,
            metadata: { autoSkipped: true },
          }));
          parentNodeId = skippedNode.id;
        }
      }
      const node = await createDesignWorkflowNode(createNodeInput({
        workflowId: context.workflow.id,
        parentNodeId,
        stageKey,
        status: 'active',
        sourceFeature: readString(body.sourceFeature) || current?.stageKey || null,
        inputAssetId: relation.inputAssetId,
        parentJobId: relation.parentJobId,
        parentResultId: relation.parentResultId,
        metadata: asRecord(body.metadata),
      }));
      const workflow = await updateDesignWorkflow(
        context.workflow.id,
        context.workflow.projectId,
        context.userId,
        {
          currentNodeId: node.id,
          status: stageKey === 'delivery' ? 'completed' : 'active',
        },
      );
      res.status(201).json(apiOk({
        workflow,
        node,
        nodes: await listDesignWorkflowNodes(
          context.workflow.id,
          context.workflow.projectId,
          context.userId,
        ),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:workflowId/skip', requireAuth, async (req, res, next) => {
    try {
      const context = await readWorkflowContext(req.params.projectId, req.params.workflowId, req);
      if (!context) {
        return void res.status(404).json(apiError('Design workflow not found.', 'DESIGN_WORKFLOW_NOT_FOUND'));
      }
      const current = context.workflow.currentNodeId
        ? await getDesignWorkflowNode(
            context.workflow.currentNodeId,
            context.workflow.id,
            context.workflow.projectId,
            context.userId,
          )
        : null;
      if (!current) {
        return void res.status(409).json(apiError('Current workflow node is missing.', 'DESIGN_WORKFLOW_CURRENT_NODE_MISSING'));
      }
      const nextStage = readNextStage(current.stageKey);
      if (!nextStage) {
        return void res.status(409).json(apiError('The delivery stage cannot be skipped.', 'DESIGN_WORKFLOW_SKIP_NOT_ALLOWED'));
      }
      const skipped = await updateDesignWorkflowNode(current.id, { status: 'skipped' });
      const node = await createDesignWorkflowNode(createNodeInput({
        workflowId: context.workflow.id,
        parentNodeId: current.id,
        stageKey: nextStage,
        status: 'active',
        sourceFeature: current.stageKey,
        inputAssetId: current.outputAssetId || current.inputAssetId,
        parentJobId: current.outputJobId || current.parentJobId,
        parentResultId: current.outputResultId || current.parentResultId,
        metadata: { skippedStageKey: current.stageKey },
      }));
      const workflow = await updateDesignWorkflow(
        context.workflow.id,
        context.workflow.projectId,
        context.userId,
        {
          currentNodeId: node.id,
          status: nextStage === 'delivery' ? 'completed' : 'active',
        },
      );
      res.status(201).json(apiOk({
        workflow,
        skippedNode: skipped,
        node,
        nodes: await listDesignWorkflowNodes(
          context.workflow.id,
          context.workflow.projectId,
          context.userId,
        ),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:workflowId/back', requireAuth, async (req, res, next) => {
    try {
      const context = await readWorkflowContext(req.params.projectId, req.params.workflowId, req);
      if (!context) {
        return void res.status(404).json(apiError('Design workflow not found.', 'DESIGN_WORKFLOW_NOT_FOUND'));
      }
      const nodes = await listDesignWorkflowNodes(
        context.workflow.id,
        context.workflow.projectId,
        context.userId,
      );
      const byId = new Map(nodes.map(node => [node.id, node]));
      const current = context.workflow.currentNodeId
        ? byId.get(context.workflow.currentNodeId)
        : undefined;
      const previous = current?.parentNodeId ? byId.get(current.parentNodeId) : undefined;
      if (!previous) {
        return void res.status(409).json(apiError('Already at the first workflow stage.', 'DESIGN_WORKFLOW_ALREADY_AT_START'));
      }
      const workflow = await updateDesignWorkflow(
        context.workflow.id,
        context.workflow.projectId,
        context.userId,
        { currentNodeId: previous.id, status: 'active' },
      );
      res.json(apiOk({
        workflow,
        node: previous,
        nodes: await listDesignWorkflowNodes(
          context.workflow.id,
          context.workflow.projectId,
          context.userId,
        ),
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function readWorkflowContext(
  projectId: string,
  workflowId: string,
  req: Parameters<typeof getRequiredCurrentUser>[0],
) {
  const user = getRequiredCurrentUser(req);
  const workflow = await getDesignWorkflow(workflowId, projectId, user.id);
  return workflow ? { workflow, userId: user.id } : null;
}

async function validateRelation(
  body: Record<string, unknown>,
  projectId: string,
  userId: string,
): Promise<
  | { ok: true; inputAssetId: string | null; parentJobId: string | null; parentResultId: string | null }
  | { ok: false; status: number; message: string; code: string }
> {
  const inputAssetId = readString(body.inputAssetId) || null;
  if (inputAssetId && !(await getImageAsset(inputAssetId, userId))) {
    return { ok: false, status: 404, message: 'Input asset not found.', code: 'DESIGN_WORKFLOW_INPUT_ASSET_NOT_FOUND' };
  }
  const parentJobId = readString(body.parentJobId) || null;
  const parentResultId = readString(body.parentResultId) || null;
  if (parentJobId) {
    const job = await getGenerationJob(parentJobId, userId);
    if (!job || job.projectId !== projectId) {
      return { ok: false, status: 404, message: 'Parent generation job not found.', code: 'DESIGN_WORKFLOW_PARENT_JOB_NOT_FOUND' };
    }
    if (parentResultId) {
      const result = (await listGenerationResults(job.id, userId))
        .find(item => item.id === parentResultId);
      if (!result || result.projectId !== projectId) {
        return { ok: false, status: 404, message: 'Parent generation result not found.', code: 'DESIGN_WORKFLOW_PARENT_RESULT_NOT_FOUND' };
      }
      if (inputAssetId && result.assetId !== inputAssetId) {
        return { ok: false, status: 409, message: 'Input asset does not match the selected generation result.', code: 'DESIGN_WORKFLOW_RESULT_ASSET_MISMATCH' };
      }
    }
  } else if (parentResultId) {
    return { ok: false, status: 400, message: 'parentJobId is required with parentResultId.', code: 'DESIGN_WORKFLOW_PARENT_JOB_REQUIRED' };
  }
  return { ok: true, inputAssetId, parentJobId, parentResultId };
}

function createNodeInput(input: {
  workflowId: string;
  parentNodeId: string | null;
  stageKey: DesignWorkflowStageKey;
  status: DesignWorkflowNode['status'];
  sourceFeature: string | null;
  inputAssetId: string | null;
  parentJobId?: string | null;
  parentResultId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return {
    ...input,
    parentJobId: input.parentJobId || null,
    parentResultId: input.parentResultId || null,
    outputJobId: null,
    outputResultId: null,
    outputAssetId: null,
    metadata: input.metadata || {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStageKey(value: unknown): DesignWorkflowStageKey | null {
  return typeof value === 'string' && workflowStages.includes(value as DesignWorkflowStageKey)
    ? value as DesignWorkflowStageKey
    : null;
}

function readNextStage(stageKey: DesignWorkflowStageKey) {
  const index = workflowStages.indexOf(stageKey);
  return index >= 0 && index < workflowStages.length - 1
    ? workflowStages[index + 1]
    : null;
}
