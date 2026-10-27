import type { Cr9be_players } from "../generated/models/Cr9be_playersModel";
import type { Axm365_generations } from "../generated/models/Axm365_generationsModel";
import type { Axm365_generationstocoacheses } from "../generated/models/Axm365_generationstocoachesesModel";
import { lookupName } from "./dataverse";
import { normalizeGuid, sameGuid } from "./guid";

export interface GenerationOption {
  id: string;
  name: string;
}

const generationYear = (name: string): number => {
  const match = name.match(/\d{4}/) || name.match(/\d+/);
  return match ? parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
};

export function sortGenerationsByYear<T extends GenerationOption>(generations: T[]): T[] {
  return generations.sort((left, right) => {
    const leftYear = generationYear(left.name);
    const rightYear = generationYear(right.name);
    return leftYear !== rightYear ? leftYear - rightYear : left.name.localeCompare(right.name);
  });
}

export const playerGenerationName = (player: Cr9be_players): string | null =>
  player.cr9be_generationname || lookupName(player, "cr9be_generation");

function uniqueGenerationCollector() {
  const seen = new Set<string>();
  const generations: GenerationOption[] = [];
  const add = (id?: string, name?: string | null) => {
    const normalizedId = normalizeGuid(id);
    if (!id || !name || !normalizedId || seen.has(normalizedId)) return;
    seen.add(normalizedId);
    generations.push({ id, name });
  };
  return { generations, add };
}

export function buildCoachGenerationTabs(
  players: Cr9be_players[],
  coachId: string | null,
  allGenerations: Axm365_generations[],
  generationsToCoaches: Axm365_generationstocoacheses[]
): GenerationOption[] {
  const fromPlayers = uniqueGenerationCollector();
  players.forEach((player) => fromPlayers.add(player._cr9be_generation_value, playerGenerationName(player)));

  if (!coachId) return sortGenerationsByYear(fromPlayers.generations);

  const relatedToCoach = uniqueGenerationCollector();
  players
    .filter((player) => sameGuid(player._cr9be_coach_value, coachId))
    .forEach((player) => relatedToCoach.add(player._cr9be_generation_value, playerGenerationName(player)));
  allGenerations
    .filter((generation) => sameGuid(generation._cr9be_coach_value, coachId))
    .forEach((generation) => relatedToCoach.add(generation.axm365_generationid, generation.axm365_name));
  generationsToCoaches
    .filter((mapping) => sameGuid(mapping._axm365_coach_value, coachId))
    .forEach((mapping) => relatedToCoach.add(mapping._axm365_generation_value, mapping.axm365_generationname));

  const relatedWithPlayers = relatedToCoach.generations.filter((generation) =>
    players.some((player) => sameGuid(player._cr9be_generation_value, generation.id))
  );

  return sortGenerationsByYear(relatedWithPlayers.length > 0 ? relatedWithPlayers : fromPlayers.generations);
}

export function playersInGenerationTabs(
  players: Cr9be_players[],
  coachId: string | null,
  generationTabs: GenerationOption[]
): Cr9be_players[] {
  if (!coachId || generationTabs.length === 0) return players;
  const playersInTabs = players.filter((player) =>
    generationTabs.some((generation) => sameGuid(player._cr9be_generation_value, generation.id))
  );
  return playersInTabs.length > 0 ? playersInTabs : players;
}
