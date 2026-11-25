export declare function evaluateReceiptCutoverBuildGate(
  viteEnv: Readonly<Record<string, string | undefined>>,
  releaseEnv?: Readonly<Record<string, string | undefined>>,
): { allowed: boolean; reason: string };

export declare function verifyReceiptCutoverViteBuild(
  config: {mode: string; root: string},
  loadEnvFn: (mode: string, root: string, prefix: string) => Record<string, string>,
  releaseEnv?: Readonly<Record<string, string | undefined>>,
): {allowed: boolean; reason: string};
