use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.noteds.amberopener";

mod commands;
mod error;

pub use error::Error;
type Result<T> = std::result::Result<T, Error>;

/// A NIP-55 request (`type` is e.g. `get_public_key`, `sign_event`,
/// `nip44_decrypt`). `signer_package` is the signer app's package name, once
/// known from a `get_public_key` response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerRequest {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub content: String,
    pub pubkey: Option<String>,
    pub current_user: Option<String>,
    pub id: Option<String>,
    pub signer_package: Option<String>,
    /// JSON permission list, only meaningful for `get_public_key`.
    pub permissions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignerResponse {
    pub result: String,
    pub package: Option<String>,
    pub event: Option<String>,
}

pub struct AmberOpener<R: Runtime> {
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
}

impl<R: Runtime> AmberOpener<R> {
    /// Sends a NIP-55 request to the signer app: silently via its
    /// ContentResolver endpoint when the user has remembered the permission,
    /// otherwise by launching it with startActivityForResult.
    pub async fn signer_request(&self, request: SignerRequest) -> Result<SignerResponse> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin_async("signerRequest", request)
                .await
                .map_err(Into::into)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = request;
            Err(Error::UnsupportedPlatform)
        }
    }
}

pub trait AmberOpenerExt<R: Runtime> {
    fn amber_opener(&self) -> &AmberOpener<R>;
}

impl<R: Runtime, T: Manager<R>> AmberOpenerExt<R> for T {
    fn amber_opener(&self) -> &AmberOpener<R> {
        self.state::<AmberOpener<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("amber-opener")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "AmberOpenerPlugin")?;

            app.manage(AmberOpener {
                #[cfg(not(target_os = "android"))]
                _marker: std::marker::PhantomData::<fn() -> R>,
                #[cfg(target_os = "android")]
                handle,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::signer_request])
        .build()
}
