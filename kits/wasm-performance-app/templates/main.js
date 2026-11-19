import init, { perform_computation } from './pkg/wasm_app.js';

async function run() {
    await init();
    const btn = document.getElementById('run');
    const res = document.getElementById('result');
    const val = document.getElementById('val');

    btn.onclick = () => {
        const startTime = performance.now();
        const out = perform_computation(parseFloat(val.value));
        const endTime = performance.now();
        res.innerText = `Result: ${out} (Took ${(endTime - startTime).toFixed(2)}ms)`;
    };
}

run();