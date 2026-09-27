use serde::Serialize;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Manager, RunEvent};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarConnection {
    port: u16,
    nonce: String,
}

struct SidecarState {
    connection: SidecarConnection,
    child: Mutex<Option<Child>>,
    stopping: AtomicBool,
}

#[tauri::command]
fn sidecar_connection(state: tauri::State<'_, SidecarState>) -> SidecarConnection {
    state.connection.clone()
}

/// <summary>
/// Stops the sidecar and tells the monitor thread to stop restarting it, so the updater can
/// overwrite replay-editor-sidecar.exe on disk instead of failing with "file in use".
/// </summary>
#[tauri::command]
fn stop_sidecar_for_update(state: tauri::State<'_, SidecarState>) {
    state.stopping.store(true, Ordering::SeqCst);
    let child_to_stop = { state.child.lock().expect("sidecar process lock poisoned").take() };
    if let Some(mut child) = child_to_stop {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// <summary>
/// Reads a replay (.osr) or project (.oreproj) by path, for File > Open recent: paths remembered
/// from earlier sessions are outside the dialog-granted file scope, so they go through here.
/// Other file types are refused so this cannot be used to read arbitrary files.
/// </summary>
#[tauri::command]
fn read_user_file(path: String) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if !matches!(extension.as_deref(), Some("osr") | Some("oreproj")) {
        return Err("Only .osr replays and .oreproj projects can be opened.".into());
    }
    let size = std::fs::metadata(&path).map_err(|error| error.to_string())?.len();
    if size > 512 * 1024 * 1024 {
        return Err("The file is too large.".into());
    }
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|error| error.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDiagnosis {
    current_version: String,
    remote_version: Option<String>,
    download_url: Option<String>,
    manifest: Option<serde_json::Value>,
    downloaded_bytes: Option<usize>,
    error: Option<String>,
}

/// <summary>
/// Runs the update pipeline up to (but not including) installation: fetches the manifest even
/// when it isn't newer, then downloads the installer and verifies its signature. Lets a dev
/// build see exactly which step of a real update fails.
/// </summary>
#[tauri::command]
async fn diagnose_update(app: tauri::AppHandle) -> UpdateDiagnosis {
    use tauri_plugin_updater::UpdaterExt;
    let mut diagnosis = UpdateDiagnosis {
        current_version: app.package_info().version.to_string(),
        remote_version: None,
        download_url: None,
        manifest: None,
        downloaded_bytes: None,
        error: None,
    };
    let updater = match app.updater_builder().version_comparator(|_, _| true).build() {
        Ok(updater) => updater,
        Err(error) => {
            diagnosis.error = Some(format!("updater setup failed: {error}"));
            return diagnosis;
        }
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            diagnosis.error = Some("the endpoint returned no update for this platform".into());
            return diagnosis;
        }
        Err(error) => {
            diagnosis.error = Some(format!("manifest check failed: {error}"));
            return diagnosis;
        }
    };
    diagnosis.remote_version = Some(update.version.clone());
    diagnosis.download_url = Some(update.download_url.to_string());
    diagnosis.manifest = Some(update.raw_json.clone());
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => diagnosis.downloaded_bytes = Some(bytes.len()),
        Err(error) => diagnosis.error = Some(format!("download or signature check failed: {error}")),
    }
    diagnosis
}

fn sidecar_path() -> Result<PathBuf, String> {
    let target_name = "replay-editor-sidecar-x86_64-pc-windows-msvc.exe";
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(target_name);
    let executable_dir = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .ok_or("Application executable has no parent directory")?
        .to_path_buf();
    let candidates = [
        development,
        executable_dir.join("replay-editor-sidecar.exe"),
        executable_dir.join(target_name),
    ];
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or("Prepared sidecar executable was not found".to_string())
}

fn launch_sidecar(connection: &SidecarConnection) -> Result<Child, String> {
    let mut command = Command::new(sidecar_path()?);
    command
        .args([
            "--port",
            &connection.port.to_string(),
            "--nonce",
            &connection.nonce,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command.spawn().map_err(|error| error.to_string())
}

fn monitor_sidecar(app: tauri::AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let state = app.state::<SidecarState>();
        if state.stopping.load(Ordering::SeqCst) {
            break;
        }

        let mut child = state.child.lock().expect("sidecar process lock poisoned");
        let needs_start = match child.as_mut() {
            Some(process) => match process.try_wait() {
                Ok(Some(_)) | Err(_) => {
                    *child = None;
                    true
                }
                Ok(None) => false,
            },
            None => true,
        };
        if needs_start {
            match launch_sidecar(&state.connection) {
                Ok(process) => *child = Some(process),
                Err(error) => eprintln!("Sidecar restart failed: {error}"),
            }
        }
    });
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let listener = TcpListener::bind("127.0.0.1:0")?;
            let port = listener.local_addr()?.port();
            drop(listener);

            let connection = SidecarConnection {
                port,
                nonce: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
            };
            let child = launch_sidecar(&connection)
                .map_err(|error| std::io::Error::other(error))?;
            app.manage(SidecarState {
                connection,
                child: Mutex::new(Some(child)),
                stopping: AtomicBool::new(false),
            });
            monitor_sidecar(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_connection,
            stop_sidecar_for_update,
            diagnose_update,
            read_user_file
        ])
        .build(tauri::generate_context!())
        .expect("Failed to build Tauri application");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            let state = app.state::<SidecarState>();
            state.stopping.store(true, Ordering::SeqCst);
            let child_to_stop = { state.child.lock().expect("sidecar process lock poisoned").take() };
            if let Some(mut child) = child_to_stop {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
