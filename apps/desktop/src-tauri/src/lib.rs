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
        .invoke_handler(tauri::generate_handler![sidecar_connection])
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
