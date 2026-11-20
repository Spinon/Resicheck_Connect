# Private inetd-style socket worker. No Auth, network client, Docker or shell.
import os,sys,socket,struct,json,hashlib,time,datetime,pwd,tempfile,subprocess,selectors,signal,stat
ROOT='/opt/connect-image-normal-v1/codec-runtime'
HASH={'ffmpeg':'9cab893cbfe1a45d3dc274fc02869b2e2c08cd84d149b6269ed2c69e869b48ba','ffprobe':'fc1605661aafd8aa12107a2ad3e6f5378ed97fa2bf8e625dfd6f8a35883f9cf1'}
PERMIT={'purpose','attachmentId','leaseId','companyId','inspectorId','sessionId','sha256','byteLength','decoderImage','issuedAt','expiresAt'}
def admit(request,peer_uid,expected_uid,now):
 # Company UUID is task metadata, not a grant: only the pinned OS peer may submit;
 # Node validates the root-owned allowlist and server lease before this decoder.
 if peer_uid!=expected_uid or expected_uid==0 or set(request)!={'version','nonce','permit','header'} or request['version']!=1:raise ValueError()
 p=request['permit'];h=request['header']
 if not isinstance(p,dict)or set(p)!=PERMIT or not isinstance(h,dict)or set(h)!={'mime','codec','width','height'}:raise ValueError()
 import re
 uuid=lambda x:isinstance(x,str)and re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',x)
 if not re.fullmatch('[a-f0-9]{64}',request['nonce'])or not all(uuid(p[k])for k in ['attachmentId','leaseId','companyId','inspectorId','sessionId']):raise ValueError()
 if p['purpose']!='image-inspection-lease-v1'or p['inspectorId']!='ee330000-0000-4000-8000-000000000202'or p['decoderImage']!='sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e':raise ValueError()
 start=datetime.datetime.fromisoformat(p['issuedAt'].replace('Z','+00:00')).timestamp();end=datetime.datetime.fromisoformat(p['expiresAt'].replace('Z','+00:00')).timestamp()
 if not start<=now<end or not 0<end-start<=30 or type(p['byteLength'])is not int or not 16<=p['byteLength']<=4194304 or not re.fullmatch('[a-f0-9]{64}',p['sha256']):raise ValueError()
 if (h['mime'],h['codec'])not in [('image/png','png'),('image/jpeg','mjpeg')]or any(type(h[k])is not int or not 1<=h[k]<=16384 for k in ['width','height'])or h['width']*h['height']>16000000:raise ValueError()
 return min(end,now+15)
def exact(sock,n):
 b=bytearray()
 while len(b)<n:
  v=sock.recv(min(65536,n-len(b)))
  if not v:raise ValueError()
  b.extend(v)
 return b
def secure(path):
 real=os.path.realpath(path)
 if not real.startswith(ROOT+'/'):raise ValueError()
 s=os.stat(real)
 if not stat.S_ISREG(s.st_mode)or s.st_uid!=0 or s.st_mode&0o022:raise ValueError()
 return real
def bounded(tool,args,deadline,maximum):
 binary=secure(ROOT+'/usr/local/bin/'+tool)
 with open(binary,'rb')as f:
  if hashlib.sha256(f.read()).hexdigest()!=HASH[tool]:raise ValueError()
 loader=secure(ROOT+'/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2')
 command=[loader,'--inhibit-cache','--library-path',ROOT+'/usr/lib/x86_64-linux-gnu',binary]+args
 p=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'LANG':'C','LC_ALL':'C'},start_new_session=True)
 sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ,'out');sel.register(p.stderr,selectors.EVENT_READ,'err');out=bytearray();err=0;timed=False;truncated=False
 try:
  while sel.get_map():
   if time.monotonic()>=deadline:timed=True;break
   for key,_ in sel.select(min(.1,max(0,deadline-time.monotonic()))):
    data=os.read(key.fileobj.fileno(),4096)
    if not data:sel.unregister(key.fileobj);continue
    if key.data=='out':
     if len(out)+len(data)>maximum:truncated=True;break
     out.extend(data)
    else:err+=len(data)
    if err>4096:truncated=True;break
   if truncated:break
  if timed or truncated:os.killpg(p.pid,signal.SIGKILL)
  p.wait(timeout=max(.1,deadline-time.monotonic()))
  return dict(code=p.returncode,stdout=out.decode('utf8'),timedOut=timed,truncated=truncated)
 finally:
  if p.poll()is None:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=1)
  sel.close();p.stdout.close();p.stderr.close();out[:]=b'\0'*len(out)
def preflight():
 # No media/Auth. Reject any fallback to host libraries before Node starts.
 with open(secure(ROOT+'/RUNTIME-MANIFEST.json'),'r')as f:manifest=json.load(f)
 if not isinstance(manifest,dict)or not 3<=len(manifest)<=128:raise ValueError()
 for name,digest in manifest.items():
  if not isinstance(name,str)or name.startswith('/')or '..'in name.split('/')or not isinstance(digest,str)or len(digest)!=64:raise ValueError()
  with open(secure(ROOT+'/'+name),'rb')as f:
   if hashlib.sha256(f.read()).hexdigest()!=digest:raise ValueError()
 loader=secure(ROOT+'/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2')
 for name,digest in HASH.items():
  binary=secure(ROOT+'/usr/local/bin/'+name)
  with open(binary,'rb')as f:
   if hashlib.sha256(f.read()).hexdigest()!=digest:raise ValueError()
  result=subprocess.run([loader,'--inhibit-cache','--library-path',ROOT+'/usr/lib/x86_64-linux-gnu','--list',binary],capture_output=True,text=True,timeout=3,env={'LANG':'C','LC_ALL':'C'})
  if result.returncode!=0 or len(result.stdout)>65536:raise ValueError()
  for line in result.stdout.splitlines():
   line=line.strip()
   if '=>'in line:target=line.split('=>',1)[1].strip().split()[0]
   elif line.startswith('/'):target=line.split()[0]
   else:continue
   if not target.startswith('/')or os.path.relpath(secure(target),ROOT)not in manifest:raise ValueError()
 sys.stdout.write('image-codec-files-and-private-libraries-verified-no-auth\n')
def main():
 if sys.platform!='linux'or os.getuid()==0 or os.geteuid()!=os.getuid()or os.getgid()==0 or os.getegid()!=os.getgid()or any(g!=os.getgid()for g in os.getgroups()):raise ValueError()
 status=open('/proc/self/status').read()
 import re
 if not re.search(r'^NoNewPrivs:\s+1$',status,re.M)or any(not re.search('^'+k+r':\s+0+$',status,re.M)for k in ['CapEff','CapPrm','CapBnd','CapAmb','CapInh']):raise ValueError()
 sock=socket.socket(fileno=os.dup(0));sock.settimeout(16)
 _,uid,_=struct.unpack('3i',sock.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));expected=pwd.getpwnam('connect-image-inspector').pw_uid
 if uid!=expected:raise ValueError()
 size=struct.unpack('!I',exact(sock,4))[0]
 if not 1<=size<=8192:raise ValueError()
 request=json.loads(exact(sock,size));end=admit(request,uid,expected,time.time());data=exact(sock,request['permit']['byteLength']);nonce=request['nonce']
 if sock.recv(1):raise ValueError()
 try:
  if hashlib.sha256(data).hexdigest()!=request['permit']['sha256']:raise ValueError()
  deadline=time.monotonic()+max(0,end-time.time())
  with tempfile.TemporaryDirectory(prefix='connect-image-',dir='/tmp')as d:
   path=d+'/input.bin';fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
   with os.fdopen(fd,'wb')as f:f.write(data)
   common=['-threads','1','-max_alloc','67108864','-protocol_whitelist','file,pipe','-f','image2pipe','-c:v',request['header']['codec']]
   probe=bounded('ffprobe',['-v','error']+common+['-count_frames','-show_entries','format=format_name,size:stream=codec_type,codec_name,width,height,nb_read_frames:chapter=id','-of','json',path],deadline,16384)
   decode=bounded('ffmpeg',['-nostdin','-v','error','-xerror','-err_detect','explode+crccheck+bitstream+buffer']+common+['-i',path,'-map','0:v:0','-frames:v','2','-an','-sn','-dn','-f','null','-'],deadline,512)
   if time.time()>=end:raise ValueError()
   proof={'sha256':request['permit']['sha256'],'probeJson':probe['stdout'],'probeExitCode':probe['code'],'decodeExitCode':decode['code'],'timedOut':probe['timedOut']or decode['timedOut'],'outputTruncated':probe['truncated']or decode['truncated']}
   sock.sendall(json.dumps({'version':1,'nonce':nonce,'ok':True,'proof':proof}).encode())
 finally:data[:]=b'\0'*len(data);sock.close()
if __name__=='__main__':
 try:
  if sys.argv==[sys.argv[0],'--preflight']:preflight()
  elif len(sys.argv)==1:main()
  else:raise ValueError()
 except Exception:
  # Never print media, header, permit, native stderr, credential or traceback.
  sys.stderr.write('image-decoder-unavailable\n');sys.exit(1)
