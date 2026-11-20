// Server-only GET signer. No IO, ambient credentials, query signing or writes.
import{createHash,createHmac}from'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex'),hmac=(key,v)=>createHmac('sha256',key).update(v).digest();
export function signS3Get({host,path,region,accessKey,secret,stamp,headers={}}){
 if(!/^[a-z0-9.-]+$/.test(host)||!/^\/[A-Za-z0-9_./%-]+$/.test(path)||path.includes('..')||!/^[a-z0-9-]+$/.test(region)||!/^[A-Za-z0-9_-]+$/.test(accessKey)||typeof secret!=='string'||!secret.length||!/^[0-9]{8}T[0-9]{6}Z$/.test(stamp))throw Error('Read unavailable');
 const fields={host,...headers,'x-amz-content-sha256':sha(''),'x-amz-date':stamp};
 for(const[k,v]of Object.entries(headers))if(!['range','x-amz-security-token'].includes(k)||typeof v!=='string'||!v||/[\r\n]/.test(v)||v.trim()!==v)throw Error('Read unavailable');
 const names=Object.keys(fields).sort(),signed=names.join(';'),canonical=['GET',path,'',names.map(k=>k+':'+fields[k]+'\n').join(''),signed,sha('')].join('\n'),date=stamp.slice(0,8),scope=date+'/'+region+'/s3/aws4_request',string=['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n');
 const keys=[];try{let key=hmac('AWS4'+secret,date);keys.push(key);for(const part of[region,'s3','aws4_request']){key=hmac(key,part);keys.push(key);}const signature=createHmac('sha256',key).update(string).digest('hex');return{headers:{...fields,authorization:'AWS4-HMAC-SHA256 Credential='+accessKey+'/'+scope+', SignedHeaders='+signed+', Signature='+signature},canonicalHash:sha(canonical)};}finally{for(const k of keys)k.fill(0);}
}
