// src/lib/circuitBreaker.ts
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold = 3;
  private readonly cooldownMs = 60000; // 1 min

  async execute<T>(request: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error("Circuit breaker is open - Network cooldown");
    }
    try {
      const result = await request();
      this.failureCount = 0;
      return result;
    } catch (e) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      throw e;
    }
  }

  private isOpen(): boolean {
    if (this.failureCount >= this.threshold) {
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.failureCount = 0; // Half-open
        return false;
      }
      return true;
    }
    return false;
  }
}

export const supabaseCircuitBreaker = new CircuitBreaker();
