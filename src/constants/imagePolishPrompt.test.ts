import { describe, expect, it } from 'vitest';
import {
  getPeopleLevelPrompt,
  resolveImagePolishControls,
  resolveImagePolishOptions,
  resolveImagePolishPrompts,
} from './imagePolishPrompt';

describe('image polish prompt compiler', () => {
  it('defaults to no people, no plants, and strict preservation', () => {
    const result = resolveImagePolishPrompts({
      mode: 'conservative',
      controls: {
        clarity: 'high',
        lightingOptimization: 'medium',
        materialDetail: 'low',
        removeModelFeel: 'medium',
        colorPreservation: 'high',
        structurePreservation: 'high',
        denoise: 'high',
        shadow: 'medium',
        reflection: 'off',
      },
    });

    expect(result.mode).toBe('conservative');
    expect(result.options).toEqual({
      addPeople: false,
      peopleLevel: 'none',
      addPlants: false,
      plantLevel: 'none',
      preserveStrictness: 'strict',
    });
    expect(result.prompt).toContain('执行“保守提质”');
    expect(result.prompt).toContain('反射优化：关闭');
    expect(result.prompt).toContain('增加人物：不增加；不得新增任何人物');
    expect(result.prompt).toContain('增加绿植：不增加；不得新增绿植');
    expect(result.prompt).toContain('原图保持强度：严格');
    expect(result.prompt).toContain('最终硬性约束：不得新增人物、绿植、家具、装饰物或建筑构件');
    expect(result.negativePrompt).toContain('禁止新增人物');
    expect(result.negativePrompt).toContain('people, person, pedestrian, crowd, staff, visitor');
  });

  it('keeps the legacy enhanceMaterials flag compatible with materialization mode', () => {
    const result = resolveImagePolishPrompts(true);

    expect(result.mode).toBe('materialization');
    expect(result.prompt).toContain('执行“白模材质化”');
    expect(result.prompt).toContain('只补全材质和光影表达');
    expect(result.prompt).toContain('主要家具位置必须与输入图一致');
  });

  it('keeps conservative polish from auto materializing or replacing original materials', () => {
    const result = resolveImagePolishPrompts({
      mode: 'conservative',
      addPeople: true,
      peopleLevel: 'medium',
      addPlants: false,
      plantLevel: 'none',
    });

    expect(result.mode).toBe('conservative');
    expect(result.prompt).toContain('原图是什么材质，就保持什么材质');
    expect(result.prompt).toContain('仅提升现有材质的真实感与表现质量');
    expect(result.prompt).toContain('不进行材质替换');
    expect(result.prompt).toContain('不进行白模材质化');
    expect(result.negativePrompt).toContain('自动材质化');
    expect(result.negativePrompt).toContain('增加新的材质类型');
    expect(result.negativePrompt).toContain('改变原有材质系统');
    expect(result.negativePrompt).not.toMatch(/people, person|新增人物|行人|访客|工作人员/iu);
  });

  it('normalizes enabled people from none to medium and maps legacy levels', () => {
    expect(resolveImagePolishOptions({
      addPeople: true,
      peopleLevel: 'none',
      addPlants: false,
      plantLevel: 'many',
      preserveStrictness: 'invalid',
    })).toEqual({
      addPeople: true,
      peopleLevel: 'medium',
      addPlants: false,
      plantLevel: 'none',
      preserveStrictness: 'strict',
    });

    expect(resolveImagePolishOptions({
      addPeople: true,
      peopleLevel: 'few',
      addPlants: true,
      plantLevel: 'many',
    })).toMatchObject({
      peopleLevel: 'low',
      plantLevel: 'high',
    });
  });

  it('allows people only, requires people in prompt, and still forbids plants', () => {
    const result = resolveImagePolishPrompts({
      mode: 'conservative',
      addPeople: true,
      peopleLevel: 'medium',
      addPlants: false,
      plantLevel: 'none',
    });

    expect(result.options.addPeople).toBe(true);
    expect(result.options.peopleLevel).toBe('medium');
    expect(result.prompt).toContain('增加人物：必须增加真实自然的人物');
    expect(result.prompt).toContain('人物数量：增加约8—15名人物，分布自然，形成适度使用氛围。');
    expect(result.prompt).toContain('人物活动：自然行走、交谈、等候、使用空间设施，并符合空间功能的人物活动。');
    expect(result.prompt).toContain('人物是本次唯一允许新增的内容');
    expect(result.prompt).toContain('保持建筑结构、空间结构、机位、家具、设备、绿植和非人物区域不变');
    expect(result.prompt).toContain('增加绿植：不增加；不得新增绿植');
    expect(result.prompt).toContain('仅允许按照人物增强设置新增人物');
    expect(result.prompt).not.toContain('不得新增任何元素');
    expect(result.prompt).not.toContain('保持原图所有对象数量不变');
    expect(result.prompt).not.toContain('严禁新增人物');
    expect(result.prompt).not.toContain('不得新增人物、绿植');
    expect(result.negativePrompt).toContain('新增绿植');
    expect(result.negativePrompt).not.toMatch(/no people|people, person|新增人物|行人|访客|工作人员/iu);
  });

  it('allows plants only while still forbidding new people', () => {
    const result = resolveImagePolishPrompts({
      mode: 'conservative',
      addPeople: false,
      peopleLevel: 'none',
      addPlants: true,
      plantLevel: 'high',
    });

    expect(result.options.addPlants).toBe(true);
    expect(result.options.plantLevel).toBe('high');
    expect(result.prompt).toContain('增加人物：不增加；不得新增任何人物');
    expect(result.prompt).toContain('增加绿植：允许新增较多绿植');
    expect(result.prompt).toContain('不得新增人物、家具、装饰物或建筑构件');
    expect(result.negativePrompt).toContain('新增人物');
    expect(result.negativePrompt).toContain('people, person, pedestrian, crowd, staff, visitor');
    expect(result.negativePrompt).not.toContain('新增绿植');
  });

  it('keeps people and plant optional branches independent when both are enabled', () => {
    const result = resolveImagePolishPrompts({
      mode: 'white-model-materialization',
      addPeople: true,
      peopleLevel: 'low',
      addPlants: true,
      plantLevel: 'medium',
    });

    expect(result.prompt).toContain('人物和绿植是本次仅允许新增的内容');
    expect(result.prompt).toContain('增加绿植：允许新增适量绿植');
    expect(result.prompt).toContain('仅允许按照人物和绿植增强设置新增人物和绿植');
    expect(result.negativePrompt).not.toMatch(/people, person|新增人物|新增绿植/iu);
  });

  it('compiles low, medium, and high people quantity descriptions', () => {
    expect(getPeopleLevelPrompt('low')).toBe('增加约3—6名人物，分布稀疏自然。');
    expect(getPeopleLevelPrompt('medium')).toBe('增加约8—15名人物，分布自然，形成适度使用氛围。');
    expect(getPeopleLevelPrompt('high')).toBe('增加约16—25名人物，但保持动线畅通，不形成拥挤。');
    expect(getPeopleLevelPrompt('none')).toBe('增加约8—15名人物，分布自然，形成适度使用氛围。');
  });

  it('rejects disabling mandatory structure and conservative color preservation', () => {
    const controls = resolveImagePolishControls({
      structurePreservation: 'off',
      colorPreservation: 'off',
    }, 'conservative');

    expect(controls.structurePreservation).toBe('high');
    expect(controls.colorPreservation).toBe('high');
  });
});
