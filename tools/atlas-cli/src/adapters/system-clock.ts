import type { ClockPort } from "../core/ports.js";

export class SystemClock implements ClockPort {
  now(): string {
    return new Date().toISOString();
  }
}
