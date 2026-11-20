export type StaffInviteLinkInput = Readonly<{inviteId:string;token:string}>;
export type StaffInviteLinkIntent = Readonly<{version:1;inviteId:string;token:string}>;

const unavailable=()=>new Error('Invitation unavailable');
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const token256=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const pathPrefix='/v1/staff-invites/';

// Pure codec: origin must come from trusted configuration, never from a link.
// Parsing yields a bearer intent only; it does not authenticate or grant access.
export function createStaffInviteLinkCodec(options:Readonly<{origin:string}>){
  let origin:string;
  try{
    const suppliedOrigin=options.origin; // Snapshot caller-owned getters once.
    if(typeof suppliedOrigin!=='string'||suppliedOrigin.length>512||!/^[\x21-\x7e]+$/.test(suppliedOrigin))throw unavailable();
    const parsed=new URL(suppliedOrigin);
    const labels=parsed.hostname.split('.');
    if(parsed.protocol!=='https:'||parsed.origin!==suppliedOrigin||parsed.username||parsed.password
      ||parsed.hostname.length>253||labels.length<2
      ||!labels.every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      ||/^[0-9.]+$/.test(parsed.hostname))throw unavailable();
    origin=suppliedOrigin;
  }catch{throw unavailable();}

  function encode(input:StaffInviteLinkInput):string{
    try{
      const {inviteId,token}=input;
      if(!uuid(inviteId)||!token256(token))throw unavailable();
      return origin+pathPrefix+inviteId+'#token='+token;
    }catch{throw unavailable();}
  }
  function parse(input:string):StaffInviteLinkIntent{
    try{
      // Reject controls/space and normalization ambiguities before URL parsing.
      if(typeof input!=='string'||input.length>1024||!/^[\x21-\x7e]+$/.test(input)||input.includes('?'))throw unavailable();
      const parsed=new URL(input);
      if(parsed.origin!==origin||parsed.username||parsed.password||parsed.href!==input
        ||parsed.search||!parsed.pathname.startsWith(pathPrefix))throw unavailable();
      const inviteId=parsed.pathname.slice(pathPrefix.length);
      const token=parsed.hash.slice('#token='.length);
      if(!parsed.hash.startsWith('#token=')||!uuid(inviteId)||!token256(token))throw unavailable();
      // Exact reconstruction also rejects empty query, extra delimiters and encodings.
      if(encode({inviteId,token})!==input)throw unavailable();
      return Object.freeze({version:1,inviteId,token});
    }catch{throw unavailable();}
  }
  return Object.freeze({encode,parse});
}
