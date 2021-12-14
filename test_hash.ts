import { crypto } from "https://deno.land/std@0.117.0/crypto/mod.ts";
import { assert } from "https://deno.land/std@0.117.0/testing/asserts.ts";


// const x = "m43"
// const backends = 12
// const perofbackend = 3


async function selector(val: string, perofbackend: number, backends: number) {
    const pob = perofbackend >= backends ? backends : perofbackend
    const digest: ArrayBuffer = await crypto.subtle.digest(
        "SHA-1",
        new TextEncoder().encode(val),
    );

    return (new Uint8Array(digest)
        .reduce((a, b) => a + b, 0) + Math.floor(Math.random() * pob)) % backends
}

function unique(arr: number[]) {
    return Array.from(new Set(arr))
}

Deno.test("check get backend idx range", async () => {
    const valstr = "s"
    const backends = 2
    const perofbackend = 4

    const hashs: number[] = []
    for (const _ of new Array(10000)) {
        const idx = await selector(valstr, perofbackend, perofbackend >= backends ? backends : perofbackend)
        hashs.push(idx)
    }
    let indexes = unique(hashs)
    indexes = indexes.sort()
    const min = indexes[0]
    const max = indexes[indexes.length - 1]
    assert(min >= 0 && max <= backends - 1);
});

Deno.test("check backend hit range", async () => {
    const valstr = "s"
    const backends = 1
    const perofbackend = 1

    const hashs: number[] = []
    for (const _ of new Array(10000)) {
        const idx = await selector(valstr, perofbackend, perofbackend >= backends ? backends : perofbackend)
        hashs.push(idx)
    }
    const range = 1 / backends * 100
    for (const u of unique(hashs)) {
        const u1 = hashs.filter(h => h === u)
        const rr = u1.length / hashs.length * 100
        assert(rr >= range - 10 && rr <= range + 10);
    }
});

