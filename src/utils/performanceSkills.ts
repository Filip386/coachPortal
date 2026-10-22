import type { Axm365_playereventperformances } from "../generated/models/Axm365_playereventperformancesModel";

/**
 * The seven graded attributes, in display order. Each `field` is the
 * axm365_playereventperformance column holding that skill's 0–100 score.
 *
 * axm365_decisionmaking, axm365_positionskills, axm365_attitudecoachability
 * and axm365_parentfeedback were added after the generated model was last
 * built, so every read goes through readSkill/parentFeedbackOf instead of
 * the typed properties.
 */
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

// Rating used when a player has no saved performance yet — unchanged from the
// four-skill version so the "no data" card looks the same as before.
export const DEFAULT_STARS = 2;

// axm365_raiting is an option set: 693080000 = 1 star … 693080004 = 5 stars.
const RATING_CODE_BASE = 693080000;

const clampStars = (stars: number): number => Math.min(5, Math.max(1, stars));

const average = (scores: number[]): number =>
  scores.reduce((sum, score) => sum + score, 0) / scores.length;

export const codeToStars = (code?: number | null): number =>
  typeof code === "number" ? code - RATING_CODE_BASE + 1 : DEFAULT_STARS;

/** The option set only holds whole stars, so half-star ratings round up. */
export const starsToCode = (stars: number): number =>
  RATING_CODE_BASE + clampStars(Math.round(stars)) - 1;

/** Overall rating = average skill score on a five-star scale, in half-star steps. */
const ratingFromScores = (scores: number[]): number =>
  clampStars(Math.round(average(scores) / 10) / 2);

export const ratingFromSkills = (values: SkillValues): number =>
  ratingFromScores(Object.values(values));

/** Tapping a star sets every skill to the score that averages back to it. */
export const skillsForStars = (stars: number): SkillValues =>
  Object.fromEntries(PERFORMANCE_SKILLS.map((skill) => [skill.key, stars * 20])) as SkillValues;

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

/**
 * Rating shown for a saved record. A fully graded record shows the half-star
 * average of its seven skills. Records saved before the seven-skill model keep
 * the whole-star rating they were saved with — the old four-skill formula
 * bucketed differently, so recomputing would silently lower past ratings.
 */
export const performanceRating = (performance: Axm365_playereventperformances): number => {
  const scores = recordedScores(performance);
  return scores.length === PERFORMANCE_SKILLS.length
    ? ratingFromScores(scores)
    : codeToStars(performance.axm365_raiting as number | undefined);
};

/**
 * Edit-form prefill. Records saved before the seven-skill model have no score
 * for the newer skills; those start at the average of the recorded ones, so
 * opening and re-saving an older record keeps its rating.
 */
export const skillValuesFromPerformance = (
  performance?: Axm365_playereventperformances
): SkillValues => {
  if (!performance) return skillsForStars(DEFAULT_STARS);

  const scores = recordedScores(performance);
  const fallback = scores.length > 0
    ? Math.round(average(scores))
    : codeToStars(performance.axm365_raiting as number | undefined) * 20;

  return Object.fromEntries(
    PERFORMANCE_SKILLS.map((skill) => [skill.key, readSkill(performance, skill) ?? fallback])
  ) as SkillValues;
};

/** Column → score map for a create/update payload. */
export const skillPayload = (values: SkillValues): Record<string, number> =>
  Object.fromEntries(PERFORMANCE_SKILLS.map((skill) => [skill.field, values[skill.key]]));

export const parentFeedbackOf = (performance?: Axm365_playereventperformances): string => {
  const value = (performance as unknown as Record<string, unknown> | undefined)?.[PARENT_FEEDBACK_FIELD];
  return typeof value === "string" ? value.trim() : "";
};

/** "Position Skills · MID" when the player's position is known. */
export const skillLabel = (skill: PerformanceSkill, positionName?: string | null): string =>
  skill.key === "positionSkills" && positionName ? `${skill.label} · ${positionName}` : skill.label;

export const formatRating = (rating: number): string => rating.toFixed(1);
