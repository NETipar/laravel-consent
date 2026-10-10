import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter';

describe('Emitter', () => {
    it('emits to listeners in order and supports unsubscribe, remove and clear', () => {
        const emitter = new Emitter<[number]>();
        const calls: string[] = [];
        const first = vi.fn((n: number) => calls.push(`a${n}`));
        const second = vi.fn((n: number) => calls.push(`b${n}`));

        const off = emitter.add(first);
        emitter.add(second);
        emitter.emit(1);
        off();
        emitter.emit(2);
        emitter.remove(second);
        emitter.emit(3);
        emitter.add(first);
        emitter.clear();
        emitter.emit(4);

        expect(calls).toEqual(['a1', 'b1', 'b2']);
    });
});
