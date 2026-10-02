use tauri::{command, AppHandle, Runtime};

use crate::{AmberOpenerExt, SignerRequest, SignerResponse};

#[command]
pub(crate) async fn signer_request<R: Runtime>(
    app: AppHandle<R>,
    request: SignerRequest,
) -> crate::Result<SignerResponse> {
    app.amber_opener().signer_request(request).await
}
