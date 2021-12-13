try {
    const res = await fetch('http://127.0.0.1:8000/check')
    if (res.status !== 200) {
        Deno.exit(1)
    }
} catch (_e) {
    Deno.exit(1)
}