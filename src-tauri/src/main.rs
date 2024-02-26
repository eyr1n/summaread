// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use once_cell::sync::Lazy;
use reqwest::{
    header::{HeaderMap, HeaderValue},
    Client, StatusCode,
};
use serde_json::{json, Value};

static SYSTEM_PROMPT: &str = r#"まず，ユーザーから与えられるテキストから論文のタイトルをそのまま抽出して下さい．
次に，以下に与えるシステムプロンプトに従って論文を加工して下さい．
結果は，{"title": 抽出したタイトル, "body": 加工した論文} という形式のJSONで出力して下さい．
タイトルを抽出できなかった場合は，{"title": null, "body": 加工した論文} として下さい．"#;

static CLIENT: Lazy<Client> = Lazy::new(|| reqwest::Client::new());

#[tauri::command]
async fn summarize_from_local(
    api_key: String,
    path: String,
    prompt: String,
) -> Result<String, String> {
    let text = pdf_extract::extract_text(path).map_err(|e| e.to_string())?;
    summarize_with_gpt(api_key, prompt, text).await
}

#[tauri::command]
async fn summarize_from_url(
    api_key: String,
    url: String,
    prompt: String,
) -> Result<String, String> {
    let response = {
        let response = CLIENT.get(url).send().await.map_err(|e| e.to_string())?;
        if response.status() != StatusCode::OK {
            Err(response.status().to_string())
        } else {
            response.bytes().await.map_err(|e| e.to_string())
        }
    }?;
    let text = pdf_extract::extract_text_from_mem(&response).map_err(|e| e.to_string())?;
    summarize_with_gpt(api_key, prompt, text).await
}

async fn summarize_with_gpt(
    api_key: String,
    prompt: String,
    text: String,
) -> Result<String, String> {
    let headers = {
        let mut headers = HeaderMap::new();
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?,
        );
        headers
    };

    let request = json!({
        "model": "gpt-4-turbo-preview",
        "response_format": {
            "type": "json_object"
        },
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "system",
                "content": prompt
            },
            {
                "role": "user",
                "content": text
            }
        ]
    });

    let response: Value = {
        let response = CLIENT
            .post("https://api.openai.com/v1/chat/completions")
            .headers(headers)
            .json(&request)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if response.status() != StatusCode::OK {
            Err(response.status().to_string())
        } else {
            response.json().await.map_err(|e| e.to_string())
        }
    }?;

    match &response["choices"][0]["message"]["content"] {
        Value::String(summarized) => Ok(summarized.clone()),
        _ => Err("null".to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            summarize_from_local,
            summarize_from_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
