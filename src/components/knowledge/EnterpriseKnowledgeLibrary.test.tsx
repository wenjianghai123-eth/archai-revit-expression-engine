import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PromptTemplate } from '../../types';
import { EnterpriseKnowledgeLibrary } from './EnterpriseKnowledgeLibrary';

describe('EnterpriseKnowledgeLibrary', () => {
  it('renders the unified enterprise asset types and filter experience', () => {
    const template: PromptTemplate = {
      id: 'template-1',
      title: '暖木接待空间',
      category: '风格渲染',
      feature: 'style-render',
      description: '企业提示词模板。',
      previewImage: '/templates/warm-wood.png',
      promptText: 'Warm wood.',
      tags: ['暖木'],
      config: {},
      isPublic: true,
    };
    const html = renderToStaticMarkup(
      <EnterpriseKnowledgeLibrary
        templates={[template]}
        currentProjectId="project-1"
        currentUserId="user-1"
        isAdmin
        onOpenModelLibrary={() => undefined}
      />,
    );

    expect(html).toContain('企业素材知识库');
    expect(html).toContain('材质');
    expect(html).toContain('家具');
    expect(html).toContain('灯具');
    expect(html).toContain('绿植');
    expect(html).toContain('人物');
    expect(html).toContain('风格参考');
    expect(html).toContain('项目案例');
    expect(html).toContain('提示词模板');
    expect(html).toContain('企业共享');
    expect(html).toContain('个人资产');
    expect(html).toContain('我的收藏');
    expect(html).toContain('最近使用');
    expect(html).toContain('当前项目');
    expect(html).toContain('三维模型管理');
  });
});
