"""Create the release skill ZIP using an explicit public-file allowlist."""
import hashlib
import json
from pathlib import Path
import zipfile

repo = Path(__file__).resolve().parents[1]
name = 'nhanh-project-tracking'
version = json.loads((repo / 'package.json').read_text(encoding='utf-8-sig'))['version']
source = repo / 'skills' / name
files = ['SKILL.md', 'agents/openai.yaml', 'scripts/nhanh.mjs',
         'references/connection.md', 'references/rules.md']
actual = sorted(p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file())
if actual != sorted(files):
    raise SystemExit('Unexpected skill files; review the packaging allowlist')
out = repo / '.local' / 'releases' / f'v{version}'
out.mkdir(parents=True, exist_ok=True)
archive = out / f'{name}-v{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for filename in files:
        info = zipfile.ZipInfo(f'{name}/{filename}', date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, (source / filename).read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(out / 'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
print(archive)
print(checksum)
