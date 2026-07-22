import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaskEditor } from './MaskEditor';

describe('MaskEditor', () => {
  it('keeps the complete precise-mask toolbar and explicit draft actions', () => {
    const html = renderToStaticMarkup(React.createElement(MaskEditor, {
      imageDataUrl: 'data:image/png;base64,source',
      imageName: 'source.png',
      maskImageDataUrl: null,
      useFullImage: false,
      onMaskChange: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }));

    for (const label of ['画笔', '橡皮', '撤销', '重做', '清空', '缩小', '放大', '适应窗口', '拖动画布', '蒙版透明度', '确认区域', '取消编辑']) {
      expect(html).toContain(label);
    }
  });
});
