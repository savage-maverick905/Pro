export interface Usage { inputTokens: number; outputTokens: number }
export interface CompleteInput { system: string; user: string; maxTokens: number; temperature?: number; signal?: AbortSignal }
export interface CompleteOutput { text: string; usage: Usage; model: string }
/** Provider abstraction: add another LLM by implementing this interface and returning it from the registry. */
export interface LLMProvider { readonly name: string; readonly model: string; complete(i: CompleteInput): Promise<CompleteOutput> }
export class LLMError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) { super(message); this.retryable = retryable; }
}
export class AIValidationError extends Error {}
