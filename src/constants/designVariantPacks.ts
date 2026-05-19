import type { VariantStyleKey } from '../types';

export interface DesignVariantPack {
  id: string;
  label: string;
  description: string;
  styles: VariantStyleKey[];
}

export const designVariantPacks: DesignVariantPack[] = [
  {
    id: 'interior-common',
    label: '室内通用',
    description: '适合住宅、民宿、样板间等室内方案',
    styles: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
  },
  {
    id: 'commercial',
    label: '商业展示',
    description: '适合展厅、商业空间、零售空间',
    styles: ['commercial-showroom', 'light-luxury', 'industrial', 'premium-gray', 'modern-minimal', 'natural-wood', 'hotel-lobby', 'office-space'],
  },
  {
    id: 'office',
    label: '办公空间',
    description: '适合办公、共享办公、企业展厅',
    styles: ['office-space', 'modern-minimal', 'premium-gray', 'natural-wood', 'industrial', 'light-luxury', 'commercial-showroom', 'cream-style'],
  },
  {
    id: 'hotel',
    label: '酒店民宿',
    description: '适合酒店大堂、民宿、公区空间',
    styles: ['hotel-lobby', 'wabi-sabi', 'cream-style', 'natural-wood', 'light-luxury', 'premium-gray', 'modern-minimal', 'commercial-showroom'],
  },
  {
    id: 'facade',
    label: '建筑外立面',
    description: '适合建筑体块、外立面和街区表达',
    styles: ['modern-minimal', 'premium-gray', 'light-luxury', 'industrial', 'natural-wood', 'commercial-showroom', 'wabi-sabi', 'hotel-lobby'],
  },
];

export const defaultDesignVariantPackId = 'interior-common';

export function getDesignVariantPack(packId: string | undefined): DesignVariantPack {
  return designVariantPacks.find(pack => pack.id === packId) || designVariantPacks[0];
}
