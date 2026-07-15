import { describe, expect, it, vi } from 'vitest'

import { SerialSaveQueue } from './serial-save-queue'

describe('SerialSaveQueue', () => {
  it('serializes writes and keeps only the latest pending value', async () => {
    let releaseFirst = () => {}
    const firstSave = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const saved: number[] = []
    const queue = new SerialSaveQueue<number>(async (value) => {
      saved.push(value)
      if (value === 1) await firstSave
    }, vi.fn())

    queue.enqueue(1)
    queue.enqueue(2)
    queue.enqueue(3)
    releaseFirst()
    await queue.flush()

    expect(saved).toEqual([1, 3])
  })

  it('reports a failed save and continues with newer work', async () => {
    const onError = vi.fn()
    const saved: number[] = []
    const queue = new SerialSaveQueue<number>(async (value) => {
      if (value === 1) throw new Error('failed')
      saved.push(value)
    }, onError)

    queue.enqueue(1)
    queue.enqueue(2)
    await queue.flush()

    expect(onError).toHaveBeenCalledOnce()
    expect(saved).toEqual([2])
  })
})
