export type {
  KnowledgeVectorCategory,
  KnowledgeVector,
  ObserverOutput,
  ContradictionDetection,
  DeprecationCandidate,
  ReflectorOutput,
} from "./types.js";

export { ObserverAgent } from "./observer-agent.js";
export type { ObserverAgentConfig, ObserverAgentDeps } from "./observer-agent.js";

export { ReflectorAgent } from "./reflector-agent.js";
export type { ReflectorAgentConfig, ReflectorAgentDeps } from "./reflector-agent.js";

export { classifyByRules, parseLLMVectorResponse } from "./vector-classification-rules.js";
