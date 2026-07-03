import { useMutation, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { useDemo } from "@/contexts/DemoContext";

/**
 * useDemoMutation — useMutation wrapper that blocks execution in demo mode.
 *
 * In demo mode, calling the mutation will:
 * 1. Show a warning toast with the action name and "Créer mon compte" CTA
 * 2. NOT execute the mutation function
 * 3. Return a rejected promise (so calling code can handle it)
 *
 * Usage:
 * ```tsx
 * const createProduct = useDemoMutation({
 *   mutationFn: async (data) => { ... },
 *   demoAction: 'Créer un produit',
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
 * });
 *
 * // In a handler:
 * createProduct.mutate({ name: 'Test', price: 100 });
 * // In demo mode: toast appears, mutation is NOT called
 * ```
 */
interface DemoMutationOptions<TData = unknown, TError = unknown, TVariables = void>
  extends UseMutationOptions<TData, TError, TVariables> {
  /**
   * Human-readable label for the action being blocked in demo mode.
   * e.g. "Créer un produit", "Supprimer une dépense"
   */
  demoAction?: string;
}

export function useDemoMutation<TData = unknown, TError = unknown, TVariables = void>(
  options: DemoMutationOptions<TData, TError, TVariables>
): UseMutationResult<TData, TError, TVariables> {
  const { blockMutation } = useDemo();
  const { demoAction, ...mutationOptions } = options;

  return useMutation<TData, TError, TVariables>({
    ...mutationOptions,
    mutationFn: async (variables: TVariables) => {
      // Block mutation in demo mode
      if (blockMutation(demoAction)) {
        throw new Error(
          demoAction
            ? `Mode démo : ${demoAction} n'est pas disponible`
            : "Mode démo : les modifications ne sont pas autorisées"
        );
      }

      // Execute the real mutation
      if (!options.mutationFn) {
        throw new Error("useDemoMutation requires a mutationFn");
      }
      return options.mutationFn(variables);
    },
  });
}
