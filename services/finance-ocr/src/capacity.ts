export class SingleSlotCapacity {
    private occupied = false;
    private readonly waiters: Array<(release: () => void) => void> = [];

    tryAcquire() {
        if (this.occupied) return null;
        this.occupied = true;
        return this.releaseHandle();
    }

    acquire() {
        const release = this.tryAcquire();
        if (release) return Promise.resolve(release);
        return new Promise<() => void>((resolve) => {
            this.waiters.push(resolve);
        });
    }

    private releaseHandle() {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            if (next) {
                next(this.releaseHandle());
                return;
            }
            this.occupied = false;
        };
    }
}
