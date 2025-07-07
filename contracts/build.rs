use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let schema_dir = Path::new("schemas");

    for entry in fs::read_dir(schema_dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_file() && path.extension().unwrap() == "mol" {
            let file_name = path.file_stem().unwrap().to_str().unwrap();
            let output_path = Path::new(&out_dir).join(format!("{}.rs", file_name));

            let status = Command::new("moleculec")
                .arg("--language")
                .arg("rust")
                .arg("--schema-file")
                .arg(&path)
                .arg("--output-file")
                .arg(&output_path)
                .status()
                .unwrap();

            if !status.success() {
                panic!("moleculec failed to compile schema: {:?}", path);
            }
        }
    }
} 