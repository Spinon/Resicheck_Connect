// Preliminary bounded framing only. NEVER authorizes release or certifies a
// codec, signature, safe document or absence of malware. No decompression/eval.
export type Envelope = Readonly<{ status: 'rejected' }> | Readonly<{
  status: 'quarantined'; candidateType: 'audio/mp4' | 'image/png' | 'image/jpeg' | 'application/pdf';
  next: 'decoder-required' | 'document-parser-required';
}>;
const rejected: Envelope = Object.freeze({status:'rejected'});
const ascii=(b:Uint8Array,start:number,length:number)=>String.fromCharCode(...b.subarray(start,start+length));
export function inspectMediaEnvelope(bytes:Uint8Array,kind:'audio'|'image'|'document'):Envelope {
  if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>10_485_760)return rejected;
  if(kind==='audio'){
    if(bytes.length>1_048_576)return rejected;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=0,count=0,ftyp=false,moov=false,mdat=false;
    while(offset<bytes.length){
      if(++count>256||offset+8>bytes.length)return rejected;
      const size=view.getUint32(offset),type=ascii(bytes,offset+4,4);
      // Extended/implicit sizes and uncommon boxes are rejected conservatively.
      if(size<8||size>bytes.length-offset||!['ftyp','moov','mdat','free','skip'].includes(type))return rejected;
      if(type==='ftyp'){
        if(offset!==0||ftyp||size<16||size>512||(size-16)%4!==0)return rejected;
        const brand=ascii(bytes,offset+8,4);if(!['M4A ','isom','mp41','mp42'].includes(brand))return rejected;ftyp=true;
      }else if(type==='moov'){if(moov||size<=8)return rejected;moov=true;}
      else if(type==='mdat'){if(mdat||size<=8)return rejected;mdat=true;}
      offset+=size;
    }
    return ftyp&&moov&&mdat?Object.freeze({status:'quarantined',candidateType:'audio/mp4',next:'decoder-required'}):rejected;
  }
  if(kind==='image'&&bytes.length<=4_194_304){
    if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9)
      return Object.freeze({status:'quarantined',candidateType:'image/jpeg',next:'decoder-required'});
    if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)&&bytes.length>=45){
      const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=v.getUint32(16),height=v.getUint32(20);
      if(v.getUint32(8)===13&&ascii(bytes,12,4)==='IHDR'&&width>0&&height>0&&width<=8192&&height<=8192&&width*height<=16_777_216
        &&v.getUint32(bytes.length-12)===0&&ascii(bytes,bytes.length-8,4)==='IEND')return Object.freeze({status:'quarantined',candidateType:'image/png',next:'decoder-required'});
    }
  }
  if(kind==='document'&&/^%PDF-1\.[0-7]/.test(ascii(bytes,0,8))){
    const tail=ascii(bytes,Math.max(0,bytes.length-32),32);if(/%%EOF[\r\n\t ]*$/.test(tail))return Object.freeze({status:'quarantined',candidateType:'application/pdf',next:'document-parser-required'});
  }
  return rejected;
}
