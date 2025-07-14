use std::process::Command;
use std::fs;

fn main() {
    let output = Command::new("sh")
        .arg("-c")
        .arg("cd ../../../ && moleculec --language rust --schema-file schemas/ckboost.mol")
        .output()
        .expect("failed to execute process");

    if !output.status.success() {
        panic!("moleculec failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    fs::write("src/generated/ckboost.rs", &output.stdout).expect("Unable to write file");
}