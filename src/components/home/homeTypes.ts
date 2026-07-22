export interface RecentProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  generationCount: number;
  currentStage: string;
  thumbnail: string | null;
}
