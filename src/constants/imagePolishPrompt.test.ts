import { describe, expect, it } from 'vitest';
import { resolveImagePolishControls, resolveImagePolishPrompts } from './imagePolishPrompt';

describe('image polish prompt compiler', () => {
  it('compiles conservative polish with all controls and immutable safety boundaries', () => {
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
    expect(result.prompt).toContain('执行“保守提质”');
    expect(result.prompt).toContain('清晰度：重点处理');
    expect(result.prompt).toContain('光影优化：适中处理');
    expect(result.prompt).toContain('材质细节：轻度处理');
    expect(result.prompt).toContain('反射优化：关闭');
    expect(result.prompt).toContain('不得新增人物、绿植、家具或装饰');
    expect(result.prompt).toContain('不得替换材质');
    expect(result.prompt).toContain('不得改变颜色');
    expect(result.prompt).toContain('不得改变结构、相机、透视、构图或画幅');
  });

  it('keeps the legacy enhanceMaterials flag compatible with white-model materialization', () => {
    const result = resolveImagePolishPrompts(true);

    expect(result.mode).toBe('white-model-materialization');
    expect(result.prompt).toContain('执行“白模材质化”');
    expect(result.prompt).toContain('只补全材质和光影表达');
    expect(result.prompt).toContain('主要家具位置必须与输入图一致');
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
