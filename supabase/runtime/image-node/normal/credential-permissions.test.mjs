// Real observed stat profile, synthetic metadata only. No credential/FS/Auth IO.
import{test}from'node:test';import assert from'node:assert/strict';import{credentialPermissionProfile as profile}from'./credential.mjs';
test('real root/root profile requires named-UID ACL verification, never mode alone',()=>{
 const d={uid:0,gid:0,mode:0o40550},s={uid:0,gid:0,mode:0o100440};
 assert.equal(profile(d,s,986,986),'systemd-named-uid-acl-requires-verification');
 for(const change of[{gid:986},{mode:0o40551},{mode:0o40750},{uid:985}])assert.equal(profile({...d,...change},s,986,986),null);
 for(const change of[{gid:986},{mode:0o100444},{mode:0o100460},{uid:985}])assert.equal(profile(d,{...s,...change},986,986),null);
 assert.equal(profile(d,s,0,986),null);assert.equal(profile(d,s,986,0),null);
});
test('original private-owner profile remains valid',()=>{
 assert.equal(profile({uid:986,gid:986,mode:0o40700},{uid:986,gid:986,mode:0o100400},986,986),'private-owner');
});
