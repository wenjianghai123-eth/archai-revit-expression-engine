import { useEffect, useMemo, useState } from 'react';

import type { EnterpriseAssetPreferences } from '../knowledge/enterpriseAssets';

const storageKey = 'archai-enterprise-asset-preferences-v1';
const legacyTemplateFavoritesKey = 'archai-template-favorites-v1';
const legacyTemplateRecentKey = 'archai-template-recent-v1';

const emptyPreferences: EnterpriseAssetPreferences = {
  favoriteIds: [],
  recentUsage: {},
  projectLinks: {},
};

export function useEnterpriseAssetPreferences() {
  const [preferences, setPreferences] = useState<EnterpriseAssetPreferences>(readPreferences);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [preferences]);

  return useMemo(() => ({
    preferences,
    toggleFavorite(assetId: string) {
      setPreferences(previous => ({
        ...previous,
        favoriteIds: previous.favoriteIds.includes(assetId)
          ? previous.favoriteIds.filter(id => id !== assetId)
          : [...previous.favoriteIds, assetId],
      }));
    },
    markUsed(assetId: string) {
      setPreferences(previous => ({
        ...previous,
        recentUsage: { ...previous.recentUsage, [assetId]: new Date().toISOString() },
      }));
    },
    toggleProjectLink(assetId: string, projectId: string) {
      setPreferences(previous => {
        const current = previous.projectLinks[assetId] || [];
        const next = current.includes(projectId)
          ? current.filter(id => id !== projectId)
          : [...current, projectId];
        return {
          ...previous,
          projectLinks: { ...previous.projectLinks, [assetId]: next },
        };
      });
    },
  }), [preferences]);
}

export function readEnterpriseAssetPreferences(): EnterpriseAssetPreferences {
  return readPreferences();
}

function readPreferences(): EnterpriseAssetPreferences {
  if (typeof window === 'undefined') return emptyPreferences;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null') as unknown;
    const base = isPreferences(stored) ? stored : emptyPreferences;
    return mergeLegacyTemplatePreferences(base);
  } catch {
    return mergeLegacyTemplatePreferences(emptyPreferences);
  }
}

function mergeLegacyTemplatePreferences(base: EnterpriseAssetPreferences): EnterpriseAssetPreferences {
  const favoriteIds = new Set(base.favoriteIds);
  const recentUsage = { ...base.recentUsage };
  try {
    const legacyFavorites = JSON.parse(window.localStorage.getItem(legacyTemplateFavoritesKey) || '[]') as unknown;
    if (Array.isArray(legacyFavorites)) {
      for (const id of legacyFavorites) if (typeof id === 'string') favoriteIds.add(`prompt-template:${id}`);
    }
    const legacyRecent = JSON.parse(window.localStorage.getItem(legacyTemplateRecentKey) || '{}') as unknown;
    if (isRecord(legacyRecent)) {
      for (const [id, value] of Object.entries(legacyRecent)) {
        if (typeof value === 'string') recentUsage[`prompt-template:${id}`] = value;
      }
    }
  } catch {
    // Ignore malformed legacy preferences.
  }
  return { ...base, favoriteIds: Array.from(favoriteIds), recentUsage };
}

function isPreferences(value: unknown): value is EnterpriseAssetPreferences {
  return isRecord(value)
    && Array.isArray(value.favoriteIds)
    && isRecord(value.recentUsage)
    && isRecord(value.projectLinks);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
