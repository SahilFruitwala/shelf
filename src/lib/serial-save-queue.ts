export class SerialSaveQueue<T> {
  private pending: T | undefined
  private draining: Promise<void> | null = null

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  enqueue(value: T) {
    this.pending = value
    void this.start()
  }

  flush() {
    return this.start()
  }

  private start() {
    this.draining ??= this.drain().finally(() => {
      this.draining = null
      if (this.pending !== undefined) void this.start()
    })
    return this.draining
  }

  private async drain() {
    while (this.pending !== undefined) {
      const value = this.pending
      this.pending = undefined
      try {
        await this.save(value)
      } catch (error) {
        this.onError(error)
      }
    }
  }
}
