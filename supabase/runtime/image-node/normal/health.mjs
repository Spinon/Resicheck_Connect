import fs from'node:fs/promises';import{constants}from'node:fs';
const p='/var/lib/connect-image-inspector/health.json';
try{
 const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.uid===0||s.nlink!==1||(s.mode&0o777)!==0o600||s.size>4096)throw Error();
 const h=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);let v;try{const t=await h.stat();if(t.ino!==s.ino||t.dev!==s.dev)throw Error();v=JSON.parse(await h.readFile('utf8'));}finally{await h.close();}
 const fresh=v.purpose==='connect-image-inspector-normal-v1'&&Number.isSafeInteger(v.updatedAt)&&Date.now()>=v.updatedAt&&Date.now()-v.updatedAt<=45000;
 const out={healthy:fresh&&v.healthy===true,phase:fresh&&['idle','tick','stopped','lease-uncertain','auth-uncertain','logout-unconfirmed','auth-dispatched'].includes(v.phase)?v.phase:'stale',closureReviewRequired:v.closureReviewRequired===true};
 process.stdout.write(JSON.stringify(out)+'\n');process.exitCode=out.healthy?0:1;
}catch{process.stdout.write('{"healthy":false,"phase":"unavailable"}\n');process.exitCode=1;}
