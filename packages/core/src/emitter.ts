/** Minimal typed listener set. Listeners are invoked in subscription order. */
export class Emitter<Args extends unknown[]> {
    private readonly listeners = new Set<(...args: Args) => void>();

    add(listener: (...args: Args) => void): () => void {
        this.listeners.add(listener);

        return () => this.remove(listener);
    }

    remove(listener: (...args: Args) => void): void {
        this.listeners.delete(listener);
    }

    emit(...args: Args): void {
        for (const listener of [...this.listeners]) {
            listener(...args);
        }
    }

    clear(): void {
        this.listeners.clear();
    }
}
