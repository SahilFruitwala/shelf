import { QueryClient } from '@tanstack/react-query'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30,
      },
    },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
