// Accept Node versions at or above the starter's supported floor.
export function checkNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error(`This project requires Node 22.12 or newer; current Node is ${version}.`);
  }
}
checkNode();
