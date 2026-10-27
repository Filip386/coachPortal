import type { Axm365_playereventperformances } from "../generated/models/Axm365_playereventperformancesModel";

export const PERFORMANCE_SKILLS = [
  { key: "technique", field: "axm365_technique", label: "Technique", description: "Ball control, first touch, passing, shooting" },
  { key: "tactical", field: "axm365_tacticalawareness", label: "Tactical Awareness", description: "Positioning, reading the game, anticipation" },
  { key: "decisionMaking", field: "axm365_decisionmaking", label: "Decision-Making", description: "Right action at the right moment under pressure" },
  { key: "effort", field: "axm365_effort", label: "Effort & Work Rate", description: "Commitment, concentration, recovery after mistakes" },
  { key: "teamPlay", field: "axm365_teamplay", label: "Team Play", description: "Cooperation, communication, supporting teammates" },
  { key: "positionSkills", field: "axm365_positionskills", label: "Position Skills", description: "Execution of the role: GK, defence, midfield or attack" },
  { key: "attitude", field: "axm365_attitudecoachability", label: "Attitude & Coachability", description: "Discipline, respect, applying coach feedback" },
] as const;

export type PerformanceSkill = (typeof PERFORMANCE_SKILLS)[number];
export type SkillKey = PerformanceSkill["key"];
export type SkillValues = Record<SkillKey, number>;

export const PERFORMANCE_SKILL_FIELDS: string[] = PERFORMANCE_SKILLS.map((skill) => skill.field);

export const PARENT_FEEDBACK_FIELD = "axm365_parentfeedback";
export const PARENT_FEEDBACK_MAX_LENGTH = 500;

export const DEFAULT_STARS = 2;

const MIN_STARS = 1;
const MAX_STARS = 5;
const ONE_STAR_RATING_CODE = 693080000;
const SCORE_PER_STAR = 20;
const HALF_STARS_PER_STAR = 2;
const SCORE_PER_HALF_STAR = SCORE_PER_STAR / HALF_STARS_PER_STAR;

const clampStars = (stars: number): number => Math.min(MAX_STARS, Math.max(MIN_STARS, stars));

const average = (scores: number[]): number =>
  scores.reduce((sum, score) => sum + score, 0) / scores.length;

const scoreToNearestHalfStar = (score: number): number =>
  Math.round(score / SCORE_PER_HALF_STAR) / HALF_STARS_PER_STAR;

const codeToStars = (code?: number | null): number =>
  typeof code === "number" ? code - ONE_STAR_RATING_CODE + 1 : DEFAULT_STARS;

export const starsToCode = (stars: number): number =>
  ONE_STAR_RATING_CODE + clampStars(Math.round(stars)) - 1;

const ratingFromScores = (scores: number[]): number =>
  clampStars(scoreToNearestHalfStar(average(scores)));

export const ratingFromSkills = (values: SkillValues): number =>
  ratingFromScores(Object.values(values));

export const skillsForStars = (stars: number): SkillValues =>
  Object.fromEntries(PERFORMANCE_SKILLS.map((skill) => [skill.key, stars * SCORE_PER_STAR])) as SkillValues;

export const readSkill = (
  performance: Axm365_playereventperformances,
  skill: PerformanceSkill
): number | null => {
  const value = (performance as unknown as Record<string, unknown>)[skill.field];
  return typeof value === "number" ? value : null;
};

const recordedScores = (performance: Axm365_playereventperformances): number[] =>
  PERFORMANCE_SKILLS
    .map((skill) => readSkill(performance, skill))
    .filter((score): score is number => score !== null);

export const performanceRating = (performance: Axm365_playereventperformances): number => {
  const scores = recordedScores(performance);
  return scores.length === PERFORMANCE_SKILLS.length
    ? ratingFromScores(scores)
    : codeToStars(performance.axm365_raiting as number | undefined);
};

export const skillValuesFromPerformance = (
  performance?: Axm365_playereventperformances
): SkillValues => {
  if (!performance) return skillsForStars(DEFAULT_STARS);

  const scores = recordedScores(performance);
  const fallbackScore = scores.length > 0
    ? Math.round(average(scores))
    : codeToStars(performance.axm365_raiting as number | undefined) * SCORE_PER_STAR;

  return Object.fromEntries(
    PERFORMANCE_SKILLS.map((skill) => [skill.key, readSkill(performance, skill) ?? fallbackScore])
  ) as SkillValues;
};

export const skillPayload = (values: SkillValues): Record<string, number> =>
  Object.fromEntries(PERFORMANCE_SKILLS.map((skill) => [skill.field, values[skill.key]]));

export const parentFeedbackOf = (performance?: Axm365_playereventperformances): string => {
  const value = (performance as unknown as Record<string, unknown> | undefined)?.[PARENT_FEEDBACK_FIELD];
  return typeof value === "string" ? value.trim() : "";
};

export const skillLabel = (skill: PerformanceSkill, positionName?: string | null): string =>
  skill.key === "positionSkills" && positionName ? `${skill.label} · ${positionName}` : skill.label;

export const formatRating = (rating: number): string => rating.toFixed(1);
