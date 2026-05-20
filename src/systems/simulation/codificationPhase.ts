import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionStrategy } from '../factionStrategy.js';
import type { DifficultyLevel } from '../aiDifficulty.js';
import type { SimulationTrace } from './traceTypes.js';
import { log, recordResearch } from './traceRecorder.js';
import { chooseStrategicResearch } from '../aiResearchStrategy.js';
import { addResearchProgress, startResearch } from '../researchSystem.js';
import { includesResearchNode, asResearchNodeId } from '../../game/stateAccess.js';
import { getAiDifficultyProfile } from '../aiDifficulty.js';
import { getEffectiveXpCost } from '../knowledgeSystem.js';

export function startOrAdvanceCodification(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  strategy?: FactionStrategy,
  difficulty?: DifficultyLevel,
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  if (!faction || !research) {
    return state;
  }

  let currentResearch = research;
  if (!currentResearch.activeNodeId) {
    const decision = strategy ? chooseStrategicResearch(state, factionId, strategy, registry, difficulty) : null;
    if (decision) {
      const decisionNode = registry.getAllResearchDomains()
        .flatMap((domain) => Object.values(domain.nodes))
        .find((node) => node.id === decision.nodeId);
      const decisionDomain = registry.getAllResearchDomains()
        .find((domain) => domain.nodes[decision.nodeId]);
      const prerequisitesMet = (decisionNode?.prerequisites ?? []).every(
        (prereqId) => includesResearchNode(currentResearch.completedNodes, prereqId),
      );
      if (prerequisitesMet) {
        currentResearch = startResearch(
          currentResearch,
          asResearchNodeId(decision.nodeId),
          decisionNode?.prerequisites,
          faction.learnedDomains,
        );
        const nodeName = decisionNode?.name ?? decision.nodeId;
        log(trace, `${faction.name} starts research on ${nodeName} (${decision.reason})`);
        recordResearch(trace, {
          round: state.round,
          factionId,
          phase: 'started',
          nodeId: decision.nodeId,
          nodeName,
          domainId: decisionDomain?.id ?? '',
          reason: decision.reason,
        });
      }
    }
  }

  if (!currentResearch.activeNodeId) {
    return state;
  }

  const activeDomain = registry.getAllResearchDomains().find((domain) =>
    Boolean(domain.nodes[currentResearch.activeNodeId as string]),
  );
  const activeNode = activeDomain?.nodes[currentResearch.activeNodeId as string];
  if (!activeNode) {
    return state;
  }

  const researchAmount = difficulty
    ? getAiDifficultyProfile(difficulty).researchRate
    : currentResearch.researchPerTurn;

  const domainCost = getEffectiveXpCost(faction, activeDomain?.id ?? '', activeNode.xpCost);

  const updatedResearch = addResearchProgress(
    currentResearch,
    domainCost,
    researchAmount,
  );

  const researchMap = new Map(state.research);
  researchMap.set(factionId, updatedResearch);
  const current = { ...state, research: researchMap };

  if (!updatedResearch.activeNodeId) {
    log(trace, `${faction.name} completed research: ${activeNode.name}`);
    recordResearch(trace, {
      round: state.round,
      factionId,
      phase: 'completed',
      nodeId: activeNode.id,
      nodeName: activeNode.name,
      domainId: activeDomain?.id ?? '',
    });
  }

  return current;
}
