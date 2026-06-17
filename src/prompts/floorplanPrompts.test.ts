import { describe, expect, it } from 'vitest';

import { buildFloorplanColorPrompt, DEFAULT_FLOORPLAN_COLOR_PROMPT } from './floorplanPrompts';
import { buildSmartPrompt } from '../promptTemplates/intelligentPromptTemplates';

describe('buildFloorplanColorPrompt', () => {
  it('builds a complete interior colored floorplan default prompt', () => {
    const prompt = buildFloorplanColorPrompt();

    expect(prompt).toBe(DEFAULT_FLOORPLAN_COLOR_PROMPT);
    expect(prompt).toContain('室内平面彩平图');
    expect(prompt).toContain('户型结构');
    expect(prompt).toContain('墙体');
    expect(prompt).toContain('门窗');
    expect(prompt).toContain('家具位置');
    expect(prompt).toContain('家具轮廓');
    expect(prompt).toMatch(/客厅、餐厅、走廊.*浅色大理石/u);
    expect(prompt).toMatch(/厨房、卫生间、阳台.*深色瓷砖/u);
    expect(prompt).toMatch(/卧室、书房.*白橡木地板/u);
    expect(prompt).toContain('不要生成透视效果图');
    expect(prompt).toContain('三维鸟瞰图');
  });

  it('does not emit undefined or null text when user prompt is empty', () => {
    const prompt = buildFloorplanColorPrompt({ userPrompt: '   ' });

    expect(prompt).toBe(DEFAULT_FLOORPLAN_COLOR_PROMPT);
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });

  it('prioritizes material references without copying unrelated content', () => {
    const prompt = buildFloorplanColorPrompt({
      hasMaterialReferences: true,
      materialNames: ['白色大理石', '深灰防滑砖'],
    });

    expect(prompt).toContain('材质参考图优先');
    expect(prompt).toContain('颜色、纹理、质感和铺贴方向');
    expect(prompt).toContain('合理分配材质');
    expect(prompt).toContain('不要复制材质参考图中的无关物体、背景');
    expect(prompt).toContain('白色大理石、深灰防滑砖');
  });

  it('keeps user prompt while preserving hard layout constraints', () => {
    const prompt = buildFloorplanColorPrompt({
      userPrompt: '公区更明亮，卧室地板偏暖色。',
    });

    expect(prompt).toContain('用户补充要求：\n公区更明亮，卧室地板偏暖色。');
    expect(prompt).toContain('必须继续保持原始空间结构');
    expect(prompt).toContain('家具位置和家具轮廓不变');
    expect(prompt).toContain('以强约束为准');
  });

  it('keeps backward compatibility with string input', () => {
    const prompt = buildFloorplanColorPrompt('强化玄关石材层次。');

    expect(prompt).toContain('用户补充要求：\n强化玄关石材层次。');
    expect(prompt).toContain('室内平面彩平图');
  });
});
describe('floorplan expression controls', () => {
  it('adds floorplan render mode, linework preservation, and legend controls', () => {
    const prompt = buildFloorplanColorPrompt({
      floorplanRenderMode: 'flat-color',
      lineworkPreservation: 'strict',
      enableLegend: true,
      enableAreaText: true,
      enableMaterialLegend: true,
    });

    expect(prompt).toContain('Floor plan render mode: flat-color.');
    expect(prompt).toContain('pure flat colored plan expression');
    expect(prompt).toContain('Linework preservation: strict.');
    expect(prompt).toContain('Extremely strictly preserve the original linework');
    expect(prompt).toContain('Add a concise graphic legend');
    expect(prompt).toContain('Add clear area or functional text labels');
    expect(prompt).toContain('Add a material legend');
  });

  it('adds floorplan template and manual room labels to prompt', () => {
    const prompt = buildFloorplanColorPrompt({
      floorplanTemplateId: 'office-space',
      floorplanRoomLabels: [
        { id: 'r1', name: '开放办公区', roomType: 'office', positionDescription: '平面中部' },
        { id: 'r2', name: '洽谈区', roomType: 'custom', customTypeLabel: 'client meeting area', positionDescription: '入口右侧' },
      ],
    });

    expect(prompt).toContain('彩平模板：办公空间彩平');
    expect(prompt).toContain('Floorplan color template: office workspace.');
    expect(prompt).toContain('Room label guidance');
    expect(prompt).toContain('开放办公区 = office area');
    expect(prompt).toContain('洽谈区 = client meeting area');
    expect(prompt).toContain('location: 入口右侧');
  });

  it('keeps smart floorplan defaults stable while adding explicit controls', () => {
    const defaultPrompt = buildSmartPrompt({
      mode: 'floorplan',
      config: {},
    });
    const controlledPrompt = buildSmartPrompt({
      mode: 'floorplan',
      config: {
        floorplanRenderMode: 'presentation',
        lineworkPreservation: 'medium',
        enableLegend: true,
      },
    });

    expect(defaultPrompt).toContain('Floor plan render mode: semi-3d.');
    expect(defaultPrompt).toContain('Linework preservation: high.');
    expect(controlledPrompt).toContain('Floor plan render mode: presentation.');
    expect(controlledPrompt).toContain('Strengthen presentation-board quality');
    expect(controlledPrompt).toContain('Linework preservation: medium.');
    expect(controlledPrompt).toContain('Add a concise graphic legend');
  });

  it('adds template and room labels to smart floorplan prompt', () => {
    const prompt = buildSmartPrompt({
      mode: 'floorplan',
      config: {
        floorplanTemplateId: 'commercial-presentation',
        floorplanRoomLabels: [
          { id: 'r1', name: '展示区', roomType: 'commercial', positionDescription: '主入口正前方' },
        ],
      },
    });

    expect(prompt).toContain('Floorplan color template: commercial presentation.');
    expect(prompt).toContain('Manual room labels');
    expect(prompt).toContain('展示区 = commercial area');
  });
});
