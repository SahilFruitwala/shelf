import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import { useVault } from '#/contexts/vault-context'
import { createNote } from '#/server/notes'
import { Button } from '#/components/ui'

export function CreateNoteButton() {
  const { masterKey } = useVault()
  const router = useRouter()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!masterKey) throw new Error('Vault locked')
      const { encryptField } = await import('#/lib/crypto/vault-crypto')
      const title = await encryptField(masterKey, 'Untitled')
      const content = await encryptField(masterKey, '')
      return createNote({
        data: {
          encryptedTitle: title.ciphertext,
          titleIv: title.iv,
          encryptedContent: content.ciphertext,
          contentIv: content.iv,
        },
      })
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      await router.navigate({
        to: '/notes/$noteId',
        params: { noteId: result.id },
      })
    },
  })

  return (
    <Button
      variant="primary"
      onClick={() => mutation.mutate()}
      disabled={!masterKey || mutation.isPending}
    >
      <Plus className="size-4" />
      {mutation.isPending ? 'Creating…' : 'New note'}
    </Button>
  )
}
