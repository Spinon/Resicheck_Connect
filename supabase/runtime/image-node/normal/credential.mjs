import fs from'node:fs/promises';import{constants}from'node:fs';
import{execFile}from'node:child_process';import{promisify}from'node:util';
const directory='/run/credentials/connect-image-inspector.service',file=directory+'/image-auth';
const fail=()=>Error('Image service credential unavailable');
// A root-owned systemd mount may use a named UID ACL. Mode group bits then
// represent the ACL mask, not an access grant to the primary group.
export function credentialPermissionProfile(d,s,uid,gid){
 if(!Number.isInteger(uid)||!Number.isInteger(gid)||uid<=0||gid<=0)return null;
 if([0,uid].includes(d.uid)&&[0,uid].includes(s.uid)&&!(d.mode&0o077)&&!(s.mode&0o077))return'private-owner';
 if(d.uid===0&&s.uid===0&&d.gid===0&&s.gid===0&&(d.mode&0o777)===0o550&&(s.mode&0o777)===0o440)return'systemd-named-uid-acl-requires-verification';
 return null;
}
/** systemd LoadCredential only; never relax the original root0600 custody. */
export async function readNormalImageCredential(){
 if(process.platform!=='linux'||process.getuid()===0||process.getgid()===0||process.getgroups().some(g=>g!==process.getgid())||process.env.CREDENTIALS_DIRECTORY!==directory)throw fail();
 const d=await fs.lstat(directory),s=await fs.lstat(file),uid=process.getuid(),gid=process.getgid();
 if(!d.isDirectory()||d.isSymbolicLink()||!credentialPermissionProfile(d,s,uid,gid)||await fs.realpath(directory)!==directory||
 !s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<1||s.size>8192)throw fail();
 if(credentialPermissionProfile(d,s,uid,gid)==='systemd-named-uid-acl-requires-verification'){
  // Same unprivileged UID and namespace. Metadata only; no shell, input,
  // credential bytes or ambient environment forwarded to this fixed helper.
  const{stdout}=await promisify(execFile)('/usr/bin/python3',['-I','-S','/opt/connect-image-normal-v1/supabase/runtime/image-node/normal/credential-acl.py'],{encoding:'utf8',timeout:2000,maxBuffer:2048,env:{LANG:'C',LC_ALL:'C'}});
  const proof=JSON.parse(stdout);if(proof.admitted!==true||proof.uid!==uid||proof.gid!==gid||proof.fileIno!==String(s.ino)||proof.fileDev!==String(s.dev)||proof.directoryIno!==String(d.ino)||proof.directoryDev!==String(d.dev))throw fail();
 }
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const after=await handle.stat();if(after.ino!==s.ino||after.dev!==s.dev||after.size!==s.size)throw fail();
 bytes=await handle.readFile();const v=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
 if(v.purpose!=='image-signup-host-only-v1'||v.projectRef!=='ibdlvlwdzmsrbqadrudb'||v.email!=='inspector@example.invalid'||v.bootstrapId!=='75cdd601-21e1-488a-a8cf-b5d352eb2979'||typeof v.password!=='string'||v.password.length<64||v.password.length>72)throw fail();
 return{email:v.email,password:v.password};
 }finally{bytes?.fill(0);await handle.close();}
}
