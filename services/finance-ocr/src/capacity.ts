export class SingleSlotCapacity {
    private occupied = false;

    tryAcquire() {
        if (this.occupied) return null;
        this.occupied = true;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.occupied = false;
        };
    }
}
