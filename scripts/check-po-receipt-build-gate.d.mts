export declare function evaluateReceiptCutoverBuildGate(
  viteEnv: Readonly<Record<string, string | undefined>>,
  releaseEnv?: Readonly<Record<string, string | undefined>>,
): { allowed: boolean; reason: string };
