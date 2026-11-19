use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn perform_computation(input: f64) -> f64 {
    // Example: Heavy computation like a factorial or fractal iteration
    let mut result = input;
    for _ in 0..1000000 {
        result = (result + 1.0).sqrt();
    }
    result
}

#[wasm_bindgen]
pub fn process_data(data: &[u8]) -> Vec<u8> {
    // Example: Image/Data manipulation
    data.iter().map(|&x| x.wrapping_add(1)).collect()
}