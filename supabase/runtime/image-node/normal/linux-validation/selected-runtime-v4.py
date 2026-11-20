# PREPARED. No effect on import. Explicit Linux-root execution after review only.
# Copies a closed ELF dependency list from ONE STOPPED pinned container; never runs it.
import hashlib,io,json,os,pathlib,re,secrets,selectors,struct,subprocess,sys,tarfile,tempfile,time

IMAGE='sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e'
BIN={'ffmpeg':'9cab893cbfe1a45d3dc274fc02869b2e2c08cd84d149b6269ed2c69e869b48ba','ffprobe':'fc1605661aafd8aa12107a2ad3e6f5378ed97fa2bf8e625dfd6f8a35883f9cf1'}
LIB='usr/lib/x86_64-linux-gnu/'
# Explicit upper bound, not an instruction to copy all entries. Only DT_NEEDED closure.
LIBRARIES=('ld-linux-x86-64.so.2','libc.so.6','libm.so.6','libz.so.1','libpthread.so.0','libdl.so.2','librt.so.1','libgcc_s.so.1','libatomic.so.1')
ALLOW={LIB+x for x in LIBRARIES}|{'usr/local/bin/'+x for x in BIN}
PER_FILE=64*1024*1024;TOTAL=128*1024*1024
digest=lambda b:hashlib.sha256(b).hexdigest()

def unpack_one(blob,path):
 if path not in ALLOW or len(blob)>PER_FILE+1024*1024:raise ValueError('path or size')
 with tarfile.open(fileobj=io.BytesIO(blob),mode='r:')as tf:
  rows=[]
  for member in tf:
   rows.append(member)
   if len(rows)>1:raise ValueError('one regular file required')
  if len(rows)!=1:raise ValueError('one regular file required')
  m=rows[0]
  leaf=m.name[2:]if m.name.startswith('./')else m.name
  expected=pathlib.PurePosixPath(path).name
  same=leaf==expected or(path.startswith(LIB)and re.fullmatch(re.escape(expected)+r'(?:\.[0-9]+){1,3}',leaf)is not None)
  if not same or not m.isfile()or m.size>PER_FILE:raise ValueError('regular basename required')
  data=tf.extractfile(m).read(PER_FILE+1)
  if len(data)!=m.size:raise ValueError('size')
  return data

def needed(data):
 # ELF64 little-endian x86_64, bounded program/dynamic/string tables. Never exec/ldd.
 if len(data)<64 or data[:7]!=b'\x7fELF\x02\x01\x01' or struct.unpack_from('<H',data,18)[0]!=62:raise ValueError('ELF identity')
 phoff=struct.unpack_from('<Q',data,32)[0];ents,num=struct.unpack_from('<HH',data,54)
 if ents!=56 or not 1<=num<=64 or phoff+ents*num>len(data):raise ValueError('ELF program headers')
 loads=[];dynamic=None;interpreter=None
 for i in range(num):
  typ,flags,off,addr,_,size,_,_=struct.unpack_from('<IIQQQQQQ',data,phoff+i*ents)
  if off+size>len(data):raise ValueError('ELF bounds')
  if typ==1:loads.append((addr,off,size))
  elif typ==2:dynamic=(off,size)
  elif typ==3:interpreter=data[off:off+size].rstrip(b'\0').decode('ascii')
 if interpreter not in (None,'/lib64/ld-linux-x86-64.so.2','/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'):raise ValueError('ELF loader')
 if dynamic is None:return []
 off,size=dynamic
 if size%16 or size>65536:raise ValueError('dynamic table')
 tags=[];terminated=False
 for pos in range(off,off+size,16):
  tag,val=struct.unpack_from('<qQ',data,pos)
  if tag==0:terminated=True;break
  if tag in (15,29):raise ValueError('RPATH/RUNPATH not accepted')
  tags.append((tag,val))
 if not terminated:raise ValueError('dynamic termination')
 names=[v for t,v in tags if t==1]
 if not names:return []
 tables=[v for t,v in tags if t==5];sizes=[v for t,v in tags if t==10]
 if len(tables)!=1 or len(sizes)!=1 or not 0<sizes[0]<=65536:raise ValueError('string table')
 matches=[o+(tables[0]-v)for v,o,n in loads if v<=tables[0]and tables[0]+sizes[0]<=v+n]
 if len(matches)!=1:raise ValueError('string address')
 strings=data[matches[0]:matches[0]+sizes[0]];out=[]
 for index in names:
  end=strings.find(b'\0',index)
  if index>=len(strings)or end<index:raise ValueError('needed name')
  name=strings[index:end].decode('ascii')
  if name not in LIBRARIES:raise ValueError('dependency outside explicit list')
  out.append(name)
 return out

DIAGNOSTIC_STAGE="preflight"
def collect(reader,pins=BIN):
 global DIAGNOSTIC_STAGE
 queue=['usr/local/bin/ffmpeg','usr/local/bin/ffprobe',LIB+'ld-linux-x86-64.so.2'];files={};total=0
 while queue:
  path=queue.pop(0)
  if path in files:continue
  if path not in ALLOW or len(files)>=128:raise ValueError('closed path list')
  DIAGNOSTIC_STAGE="copy-and-regularity:"+path
  data=unpack_one(reader(path),path);total+=len(data)
  DIAGNOSTIC_STAGE="integrity-and-ELF:"+path
  if total>TOTAL:raise ValueError('total budget')
  if path.startswith('usr/local/bin/')and digest(data)!=pins[path.rsplit('/',1)[1]]:raise ValueError('binary hash')
  dependencies=needed(data);files[path]=data
  queue.extend(LIB+x for x in dependencies)
 return files

def cleanup_matches(meta,cid,name,nonce):
 return meta=={'id':cid,'name':'/'+name,'image':IMAGE,'running':False,'label':nonce}and len(cid)==64 and all(x in '0123456789abcdef'for x in cid)

def run():
 if sys.platform!='linux'or os.geteuid()!=0:raise ValueError('authorized Linux root required')
 # Fixed executable, daemon selected by official context; never alter socket/groups.
 docker=['/usr/bin/docker','--host','unix:///var/run/docker.sock'];end=time.monotonic()+110
 def call(args):
  r=subprocess.run(docker+args,capture_output=True,timeout=max(.1,min(15,end-time.monotonic())),env={'PATH':'/usr/bin:/bin','LANG':'C'})
  if r.returncode or len(r.stdout)>16384:raise ValueError('docker operation')
  return r.stdout.decode().strip()
 image=json.loads(call(['image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"user":{{json .Config.User}},"volumes":{{if index .Config "Volumes"}}1{{else}}0{{end}}}',IMAGE]))
 if image!={'id':IMAGE,'os':'linux','arch':'amd64','user':'65532:65532','volumes':0}:raise ValueError('image metadata')
 if os.statvfs('/var/tmp').f_bavail*os.statvfs('/var/tmp').f_frsize<256*1024*1024:raise ValueError('disk budget')
 nonce=secrets.token_hex(8);name='connect-image-runtime-copy-'+nonce;cid=None;clean=False;out=None
 report={'state':'failed','containerName':name,'runtimeExecuted':False,'auth':False,'network':False,'containerRemoved':False}
 try:
  cid=call(['container','create','--pull=never','--name',name,'--label','connect.image-runtime-copy='+nonce,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','64m','--cpus','0.10','--pids-limit','4','--entrypoint','/usr/local/bin/ffprobe',IMAGE])
  if len(cid)!=64 or any(x not in '0123456789abcdef'for x in cid):raise ValueError('container id')
  def reader(path):
   # -L resolves only the explicitly named image-internal file; tar must be regular.
   p=subprocess.Popen(docker+['container','cp','-L',cid+':/'+path,'-'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={'PATH':'/usr/bin:/bin','LANG':'C'},start_new_session=True)
   data=bytearray();sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ)
   try:
    while sel.get_map():
     if time.monotonic()>=end:raise TimeoutError()
     for key,_ in sel.select(.1):
      chunk=os.read(key.fd,65536)
      if not chunk:sel.unregister(key.fileobj);continue
      data.extend(chunk)
      if len(data)>PER_FILE+1024*1024:raise ValueError('copy budget')
    if p.wait(timeout=max(.1,end-time.monotonic())):raise ValueError('copy failed')
    return bytes(data)
   finally:
    if p.poll()is None:p.kill();p.wait(timeout=2)
    sel.close();p.stdout.close()
  files=collect(reader)
  # No payload is written before all names/regular files/ELF/dependency/pin checks pass.
  out=pathlib.Path(tempfile.mkdtemp(prefix='connect-image-runtime-',dir='/var/tmp'));os.chmod(out,0o700)
  for path,data in files.items():
   target=out/path;target.parent.mkdir(parents=True,exist_ok=True)
   fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o500)
   with os.fdopen(fd,'wb')as f:f.write(data)
  manifest={path:digest(data)for path,data in sorted(files.items())}
  (out/'RUNTIME-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
  report.update(state='selected-runtime-staged-not-promoted-not-executed',directory=str(out),imageId=IMAGE,files=len(files),bytes=sum(map(len,files.values())),manifestSha256=digest((out/'RUNTIME-MANIFEST.json').read_bytes()))
 except Exception as error:
  report['failureStage']=DIAGNOSTIC_STAGE
  safe={'path or size','one regular file required','regular basename required','size','ELF identity','ELF program headers','ELF bounds','ELF loader','dynamic table','RPATH/RUNPATH not accepted','dynamic termination','string table','string address','needed name','dependency outside explicit list','closed path list','total budget','binary hash','copy budget','copy failed'}
  report['failureCode']=str(error)if isinstance(error,ValueError)and str(error)in safe else type(error).__name__
  raise
 finally:
  if True:
   # Fresh cleanup budget even after operation deadline. Never rm by wildcard/name alone.
   end=time.monotonic()+8
   try:
    meta=json.loads(call(['container','inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"label":{{json (index .Config.Labels "connect.image-runtime-copy")}}}',cid or name]))
    if cid is None:cid=meta['id'] # Reconcile uncertain create response; no second create.
    if not cleanup_matches(meta,cid,name,nonce):raise ValueError('owned cleanup mismatch')
    call(['container','rm',cid]);clean=True
   except Exception:report['cleanup']='requires-review-exact-owned-container';report['containerId']=cid;report['containerName']=name
  report['containerRemoved']=clean
  # Retain verified/incomplete private staging for audit; no recursive deletion.
  if out is not None:(out/'SELECTED-RECEIPT.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report),flush=True)
 if report['state']!='selected-runtime-staged-not-promoted-not-executed'or not clean:raise ValueError('selection not accepted')

if __name__=='__main__':
 try:
  if sys.argv[1:]!=['--stage-selected-runtime']:raise ValueError('explicit mode required')
  run()
 except Exception:sys.stderr.write('selected-runtime-not-accepted\n');sys.exit(1)
