import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function evidenceResolver(root, board) {
  const records=new Map();
  if(board.archivedEvidenceManifest!==undefined){
    const file=board.archivedEvidenceManifest;
    assert.equal(file,'docs/project/ARCHIVED-EVIDENCE-REFERENCES.json');
    const archive=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
    assert.equal(archive.schemaVersion,1);assert.equal(archive.purpose,'historical-reference-only-not-functional-revalidation');
    for(const row of archive.references){
      assert.equal(typeof row.path,'string');assert(!path.isAbsolute(row.path)&&!row.path.split(/[\\/]/).includes('..'));
      assert(/^[a-f0-9]{64}$/.test(row.sha256));assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0);assert(!records.has(row.path));
      records.set(row.path,row);
    }
  }
  return async file=>{
    try{await fs.access(path.join(root,file));return;}catch(error){if(error.code!=='ENOENT')throw error;}
    assert(records.has(file),'Current evidence missing and not an explicitly archived historical reference: '+file);
  };
}
