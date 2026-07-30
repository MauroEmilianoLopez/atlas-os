import type { KnowledgeSnapshot } from "./contracts.js";

export interface KnowledgeSourcePort {
  load(): KnowledgeSnapshot;
}

export interface ClockPort {
  now(): string;
}
