// Candidate33 Expo metadata writer; called only by the future isolated build.
import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
assert.equal(process.argv.length,2);
const plan=JSON.parse(fs.readFileSync(new URL('./release-plan.PREPARED.json',import.meta.url),'utf8'));
const android=fileURLToPath(new URL('../../android/',import.meta.url)),bytes=fs.readFileSync(path.join(android,'messaging35-generated/app.config')),value=JSON.parse(bytes);
assert.equal(value.android.package,plan.android.package);assert.equal(value.version,plan.release);assert.equal(value.android.versionCode,plan.versionCode);assert.equal(value.extra.normalImageAvailabilityRequired,true);assert.equal(value.extra.deliveryCandidate,true);
assert(!/sb_secret_|service_role|https?:\/\/|@example\.invalid/.test(bytes.toString('utf8')));
const out=path.join(android,'messaging35-expo-constants-build/generated/assets/expo-constants');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'app.config'),bytes);
