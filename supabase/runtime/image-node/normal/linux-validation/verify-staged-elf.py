# One private, synthetic host-ELF test, executed only in a transient non-root unit.
import contextlib,hashlib,io,json,os,pathlib,re,sys,time
MODULE_SHA='4b4a22caa3660572182fc92d1defa5cf39f5c7a2ae9718c19f16b50f7183e6f0'

def main(gate_path):
 base=pathlib.Path(gate_path).parent
 if not re.fullmatch('/run/connect-image-elf-verify-[a-f0-9]{16}',str(base))or pathlib.Path(gate_path).name!='gate.json':raise ValueError('scope')
 end=time.monotonic()+20
 while not pathlib.Path(gate_path).exists():
  if time.monotonic()>end:raise TimeoutError()
  time.sleep(.03)
 gate=json.loads(pathlib.Path(gate_path).read_text());result={'state':'failed','step':'sandbox'}
 try:
  status=pathlib.Path('/proc/self/status').read_text()
  if os.getuid()==0 or os.getuid()!=gate['uid']or any(g!=os.getgid()for g in os.getgroups()):raise ValueError('uid')
  if not re.search(r'^NoNewPrivs:\s+1$',status,re.M):raise ValueError('nnp')
  for cap in ['CapEff','CapPrm','CapBnd','CapAmb','CapInh']:
   if not re.search('^'+cap+r':\s+0+$',status,re.M):raise ValueError('caps')
  if os.stat('/proc/self/ns/net').st_ino==gate['hostNetInode']:raise ValueError('network namespace')
  source=(base/'codec-connection.py').read_bytes()
  if hashlib.sha256(source).hexdigest()!=MODULE_SHA:raise ValueError('source pin')
  module={'__name__':'staging_preflight_only'};exec(compile(source,'pinned-codec-connection.py','exec'),module)
  module['ROOT']=str(base/'runtime') # Test binding only; candidate source bytes unchanged.
  result['step']='private-loader-and-library-preflight'
  with contextlib.redirect_stdout(io.StringIO()):module['preflight']()
  fixture=base/'fixture.png'
  if hashlib.sha256(fixture.read_bytes()).hexdigest()!=gate['fixtureSha256']:raise ValueError('input pin')
  common=['-threads','1','-max_alloc','67108864','-protocol_whitelist','file,pipe','-f','image2pipe','-c:v','png'];deadline=time.monotonic()+15
  result['step']='ffprobe'
  probe=module['bounded']('ffprobe',['-v','error']+common+['-count_frames','-show_entries','format=format_name,size:stream=codec_type,codec_name,width,height,nb_read_frames:chapter=id','-of','json',str(fixture)],deadline,16384)
  if probe['code']!=0 or probe['timedOut']or probe['truncated']:raise ValueError('probe')
  data=json.loads(probe['stdout']);streams=data.get('streams',[])
  if len(streams)!=1 or streams[0].get('codec_name')!='png'or streams[0].get('width')!=16 or streams[0].get('height')!=16 or streams[0].get('nb_read_frames')!='1':raise ValueError('frame')
  result['step']='ffmpeg'
  decoded=module['bounded']('ffmpeg',['-nostdin','-v','error','-xerror','-err_detect','explode+crccheck+bitstream+buffer']+common+['-i',str(fixture),'-map','0:v:0','-frames:v','2','-an','-sn','-dn','-f','null','-'],deadline,512)
  if decoded['code']!=0 or decoded['timedOut']or decoded['truncated']:raise ValueError('decode')
  result.update(state='passed-real-staged-private-ELF-loader-and-synthetic-PNG',nonRoot=True,noNewPrivileges=True,capabilitiesEmpty=True,privateNetwork=True,privateLibraryClosureVerified=True,probeExitCode=0,decodeExitCode=0,width=16,height=16,frames=1,fixtureSha256=gate['fixtureSha256'],candidateSourceUnchanged=True)
 except Exception as error:result['errorClass']=type(error).__name__
 output=base/'output'/'result.json';fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(result,f)
 if result['state']!='passed-real-staged-private-ELF-loader-and-synthetic-PNG':raise ValueError('not accepted')

if __name__=='__main__':
 try:
  if len(sys.argv)!=2:raise ValueError('explicit gate required')
  main(sys.argv[1])
 except Exception:sys.exit(1)
