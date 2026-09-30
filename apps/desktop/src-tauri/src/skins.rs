//! Read-only access to an osu! (stable) installation's skins, for the playfield skin and
//! hitsound fallbacks. Only files inside `<osu>/Skins/<skin>/` with image, audio or `skin.ini`
//! extensions can be read.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuStableInstall {
    directory: String,
    current_skin: Option<String>,
}

const READABLE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "wav", "ogg", "mp3", "ini"];

fn has_skins(directory: &Path) -> bool {
    directory.join("Skins").is_dir()
}

/// The folder of the `osu!.exe` registered for .osz files / the osu:// protocol.
#[cfg(windows)]
fn registered_directories() -> Vec<PathBuf> {
    let mut found = Vec::new();
    for key in [
        r"HKCR\osustable.File.osz\Shell\Open\Command",
        r"HKCR\osu\shell\open\command",
    ] {
        let Ok(output) = std::process::Command::new("reg")
            .args(["query", key, "/ve"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output()
        else {
            continue;
        };
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(start) = text.find('"') {
            if let Some(length) = text[start + 1..].find('"') {
                let exe = PathBuf::from(&text[start + 1..start + 1 + length]);
                if let Some(parent) = exe.parent() {
                    found.push(parent.to_path_buf());
                }
            }
        }
    }
    found
}

#[cfg(not(windows))]
fn registered_directories() -> Vec<PathBuf> {
    Vec::new()
}

/// The skin selected in stable, from `osu!.<user>.cfg`.
fn current_skin(directory: &Path) -> Option<String> {
    let entries = fs::read_dir(directory).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        if !lower.starts_with("osu!.") || !lower.ends_with(".cfg") || lower == "osu!.cfg" {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        for line in text.lines() {
            if let Some((key, value)) = line.split_once('=') {
                if key.trim().eq_ignore_ascii_case("Skin") {
                    let skin = value.trim();
                    if !skin.is_empty() && directory.join("Skins").join(skin).is_dir() {
                        return Some(skin.to_string());
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn detect_osu_stable() -> Option<OsuStableInstall> {
    let mut candidates = registered_directories();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join("osu!"));
    }
    for drive in ["C", "D", "E", "F", "G"] {
        candidates.push(PathBuf::from(format!(r"{drive}:\osu!")));
        candidates.push(PathBuf::from(format!(r"{drive}:\osu")));
        candidates.push(PathBuf::from(format!(r"{drive}:\Games\osu!")));
    }
    candidates.into_iter().find(|directory| has_skins(directory)).map(|directory| OsuStableInstall {
        current_skin: current_skin(&directory),
        directory: directory.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn osu_stable_current_skin(directory: String) -> Option<String> {
    current_skin(Path::new(&directory))
}

#[tauri::command]
pub fn list_stable_skins(directory: String) -> Result<Vec<String>, String> {
    let skins = PathBuf::from(directory).join("Skins");
    let mut names: Vec<String> = fs::read_dir(&skins)
        .map_err(|error| format!("Could not open {}: {error}", skins.display()))?
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    Ok(names)
}

/// A single path component: no separators, no parent references.
fn plain_name(value: &str) -> bool {
    !value.is_empty() && value != "." && value != ".." && !value.contains(['/', '\\', ':'])
}

fn skin_directory(directory: &str, skin: &str) -> Result<PathBuf, String> {
    if !plain_name(skin) {
        return Err("Invalid skin name.".into());
    }
    let path = PathBuf::from(directory).join("Skins").join(skin);
    if !path.is_dir() {
        return Err(format!("Skin not found: {skin}"));
    }
    Ok(path)
}

/// File names in a skin folder (top level only), lower-cased, so the page can pick @2x variants
/// and fallbacks without probing.
#[tauri::command]
pub fn list_skin_files(directory: String, skin: String) -> Result<Vec<String>, String> {
    let folder = skin_directory(&directory, &skin)?;
    Ok(fs::read_dir(&folder)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter(|entry| entry.path().is_file())
        .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
        .collect())
}

#[tauri::command]
pub fn read_skin_file(directory: String, skin: String, file: String) -> Result<tauri::ipc::Response, String> {
    // Skins may keep numbers in a subfolder (skin.ini HitCirclePrefix, e.g. "fonts\default"), so
    // allow a relative path whose every part is a plain name.
    let parts: Vec<&str> = file.split(['/', '\\']).collect();
    if parts.len() > 4 || !parts.iter().all(|part| plain_name(part)) {
        return Err("Invalid file name.".into());
    }
    let extension = Path::new(&file)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if !extension.as_deref().is_some_and(|value| READABLE_EXTENSIONS.contains(&value)) {
        return Err("Only skin images, sounds and skin.ini can be read.".into());
    }
    let mut folder = skin_directory(&directory, &skin)?;
    for part in &parts[..parts.len() - 1] {
        folder = folder.join(part);
    }
    let file = parts[parts.len() - 1].to_string();
    // Windows paths are case-insensitive, but match explicitly so other filesystems work too.
    let path = fs::read_dir(&folder)
        .map_err(|error| error.to_string())?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().eq_ignore_ascii_case(&file))
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("{file} is not in this skin."))?;
    let size = fs::metadata(&path).map_err(|error| error.to_string())?.len();
    if size > 32 * 1024 * 1024 {
        return Err("The file is too large.".into());
    }
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|error| error.to_string())
}
