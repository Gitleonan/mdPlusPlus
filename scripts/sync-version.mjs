import { readFile, writeFile } from 'node:fs/promises';

const packageJsonPath = new URL('../package.json', import.meta.url);
const cargoTomlPath = new URL('../src-tauri/Cargo.toml', import.meta.url);
const tauriConfPath = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const aboutModalPath = new URL('../src/components/AboutModal/AboutModal.tsx', import.meta.url);

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const version = packageJson.version;

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json version must be semver-compatible, got: ${version}`);
}

// Sync Cargo.toml
const cargoToml = await readFile(cargoTomlPath, 'utf8');
const nextCargoToml = cargoToml.replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
);

if (nextCargoToml === cargoToml) {
  console.log(`Cargo.toml already matches package.json version ${version}`);
} else {
  await writeFile(cargoTomlPath, nextCargoToml);
  console.log(`Synced src-tauri/Cargo.toml to package.json version ${version}`);
}

// Sync tauri.conf.json
const tauriConfRaw = await readFile(tauriConfPath, 'utf8');
const tauriConf = JSON.parse(tauriConfRaw);
tauriConf.version = version;
const nextTauriConf = JSON.stringify(tauriConf, null, 2) + '\n';

if (nextTauriConf === tauriConfRaw) {
  console.log(`tauri.conf.json already matches package.json version ${version}`);
} else {
  await writeFile(tauriConfPath, nextTauriConf);
  console.log(`Synced src-tauri/tauri.conf.json to package.json version ${version}`);
}

// Sync AboutModal APP_VERSION
const aboutModalRaw = await readFile(aboutModalPath, 'utf8');
const nextAboutModal = aboutModalRaw.replace(
  /^const APP_VERSION = '.*';$/m,
  `const APP_VERSION = '${version}';`,
);

if (nextAboutModal === aboutModalRaw) {
  console.log(`AboutModal already matches package.json version ${version}`);
} else {
  await writeFile(aboutModalPath, nextAboutModal);
  console.log(`Synced AboutModal APP_VERSION to package.json version ${version}`);
}
