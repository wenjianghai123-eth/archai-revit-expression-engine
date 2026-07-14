import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImageEditSessionWorkspace } from './ImageEditSessionWorkspace';

describe('ImageEditSessionWorkspace', () => {
  it('shows versions, selected base version, chat instruction, and constraints', () => {
    const markup=renderToStaticMarkup(<ImageEditSessionWorkspace initialDetail={{session:{id:'session-1',userId:'user-1',projectId:'project-1',sourceAssetId:'asset-0',originalVersionId:'v0',currentVersionId:'v1',title:'客厅连续修改',permanentConstraints:{},aspectRatio:'16:9',status:'active',createdAt:'2026-07-14T00:00:00Z',updatedAt:'2026-07-14T00:00:00Z'},versions:[{id:'v0',assetId:'asset-0',sessionId:'session-1',parentVersionId:null,versionNumber:0,storagePath:'v0.png',publicUrl:'/uploads/v0.png',userInstruction:'',compiledPrompt:'',provider:null,model:null,generationJobId:null,createdBy:'user-1',createdAt:'2026-07-14T00:00:00Z'},{id:'v1',assetId:'asset-1',sessionId:'session-1',parentVersionId:'v0',versionNumber:1,storagePath:'v1.png',publicUrl:'/uploads/v1.png',userInstruction:'墙面改为浅木色',compiledPrompt:'compiled',provider:'apiyi-nano-banana2-edit',model:'test',generationJobId:'job-1',createdBy:'user-1',createdAt:'2026-07-14T00:01:00Z'}],messages:[{id:'message-1',sessionId:'session-1',role:'user',content:'墙面改为浅木色',baseVersionId:'v0',outputVersionId:'v1',generationJobId:'job-1',status:'succeeded',clientRequestId:'request-1',errorCode:null,errorMessage:null,createdAt:'2026-07-14T00:01:00Z'}]}} creditBalance={99} onRefreshCredits={async()=>undefined} onClose={()=>undefined}/>);
    expect(markup).toContain('V1');expect(markup).toContain('墙面改为浅木色');expect(markup).toContain('下一条指令将基于 V1');expect(markup).toContain('严格保持结构');expect(markup).toContain('发送修改');
    expect(markup).toContain('role="slider"');expect(markup).toContain('/uploads/v0.png');expect(markup).toContain('/uploads/v1.png');
    expect(markup).toContain('发送修改 · 1K · 1 算力点');expect(markup).toContain('高清定稿 · 2K · 1 算力点');expect(markup).toContain('创建新的子版本');
    expect(markup).toContain('添加局部遮罩');
  });
});
