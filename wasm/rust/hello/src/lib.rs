use js_sys::Math::log;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode};

use crate::utils::set_panic_hook;

mod utils;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    set_panic_hook();
    alert(format!("Hello, {}", name).as_str());
}

#[wasm_bindgen]
pub fn calc(name: &str) -> String {
    set_panic_hook();
    return format!("Hello, {}, length: {}", name, name.len());
}

#[derive(Debug)]
struct XX {
    x: u8,
    y: u8,
    z: u8,
}

#[wasm_bindgen]
pub async fn get(url: &str) -> Result<JsValue, JsValue> {
    dbg!("asdad");
    let xx = XX { x: 0, y: 0, z: 0 };
    println!("{:#?}", xx);

    // let { x, y, z } = xx;

    // let list = vec![1, 2, 3, 5];
    // let [a, b, c, d] = list;
    // dbg!(a + b + c + d);


    let mut opts = RequestInit::new();
    opts.method("GET");
    opts.mode(RequestMode::Cors);
    let request = Request::new_with_str_and_init(&url, &opts)?;
    request
        .headers()
        .set("AAA", "bbb")?;
    let window = web_sys::window().unwrap();
    let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;
    Ok(resp_value)
}
