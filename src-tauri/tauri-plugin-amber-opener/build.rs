const COMMANDS: &[&str] = &["signer_request"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
