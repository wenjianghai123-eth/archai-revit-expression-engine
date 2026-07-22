import {
  getDesignWorkflow,
  getDesignWorkflowNode,
  updateDesignWorkflowNode,
  updateGenerationResult,
  type GenerationJob,
  type GenerationResult,
} from './storage';

export async function validateDesignWorkflowGenerationContext(input: {
  projectId: string;
  userId: string;
  config: Record<string, unknown>;
}) {
  const workflowId = readConfigString(input.config, 'designWorkflowId');
  const nodeId = readConfigString(input.config, 'designWorkflowNodeId');
  if (!workflowId && !nodeId) return null;
  if (!workflowId || !nodeId) {
    throw createWorkflowError(
      'DESIGN_WORKFLOW_CONTEXT_INCOMPLETE',
      'Both designWorkflowId and designWorkflowNodeId are required.',
    );
  }
  const workflow = await getDesignWorkflow(workflowId, input.projectId, input.userId);
  if (!workflow) {
    throw createWorkflowError('DESIGN_WORKFLOW_NOT_FOUND', 'Design workflow not found.');
  }
  const node = await getDesignWorkflowNode(
    nodeId,
    workflow.id,
    input.projectId,
    input.userId,
  );
  if (!node) {
    throw createWorkflowError('DESIGN_WORKFLOW_NODE_NOT_FOUND', 'Design workflow node not found.');
  }
  return { workflow, node };
}

export async function linkDesignWorkflowGenerationJob(job: GenerationJob) {
  const context = await validateDesignWorkflowGenerationContext({
    projectId: job.projectId,
    userId: job.userId,
    config: job.config,
  });
  if (!context) return;
  await updateDesignWorkflowNode(context.node.id, {
    outputJobId: job.id,
    metadata: {
      generationStep: job.step || job.config.generationStep || null,
      generationMode: job.mode,
    },
  });
}

export async function completeDesignWorkflowGeneration(
  job: GenerationJob,
  result: GenerationResult,
) {
  const context = await validateDesignWorkflowGenerationContext({
    projectId: job.projectId,
    userId: job.userId,
    config: job.config,
  });
  if (!context) return;
  await updateDesignWorkflowNode(context.node.id, {
    status: 'completed',
    outputJobId: job.id,
    outputResultId: result.id,
    outputAssetId: result.assetId,
  });
  await updateGenerationResult(result.id, job.userId, {
    metadata: {
      designWorkflowId: context.workflow.id,
      designWorkflowNodeId: context.node.id,
      designWorkflowStageKey: context.node.stageKey,
      parentJobId: context.node.parentJobId,
      parentResultId: context.node.parentResultId,
      sourceFeature: context.node.sourceFeature,
    },
  });
}

function readConfigString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function createWorkflowError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
