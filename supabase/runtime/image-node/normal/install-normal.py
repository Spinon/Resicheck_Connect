"""Reviewed local candidate. Explicit Linux-root maintenance only; never on import.
No Docker, Auth, network, admin key, shell, sudoers or existing service mutation.
Fresh install or exact idempotent repeat; conflicting installs fail closed.
"""
import base64,hashlib,json,os,pathlib,re,shutil,stat,subprocess,sys,tempfile
ROOT=pathlib.Path('/opt/connect-image-normal-v1')
ETC=pathlib.Path('/etc/connect-image-inspector')
STATE=pathlib.Path('/var/lib/connect-image-inspector')
JOURNAL=pathlib.Path('/var/lib/connect-image-install-v1')
CUSTODY=pathlib.Path('/var/lib/connect-image-auth-bootstrap-v1/credential-private.json')
NODE=pathlib.Path('/opt/connect-codec/node/bin/node')
UNITS=('connect-image-codec.socket','connect-image-codec@.service','connect-image-inspector.service')
CO='ee330000-0000-4000-8000-000000000201';ACTOR='ee330000-0000-4000-8000-000000000202'
IMAGE='sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e'
RUNTIME_MANIFEST='018804def94ccad7bc74c05a9fe1d55392d3e59c95a23edc6abf3c09ab17fe2d'
NORMAL='supabase/runtime/image-node/normal/'
BIN={'ffmpeg':'9cab893cbfe1a45d3dc274fc02869b2e2c08cd84d149b6269ed2c69e869b48ba','ffprobe':'fc1605661aafd8aa12107a2ad3e6f5378ed97fa2bf8e625dfd6f8a35883f9cf1'}
def digest(b):return hashlib.sha256(b).hexdigest()
def demand(ok):
 if not ok:raise ValueError('installation precondition differs')
def regular(p,maximum=4*1024*1024,owned=True):
 p=pathlib.Path(p);s=p.lstat();demand(stat.S_ISREG(s.st_mode)and s.st_nlink==1 and s.st_size<=maximum)
 for parent in [p,*p.parents]:demand(not parent.is_symlink())
 if owned:
  demand(s.st_uid==0 and not s.st_mode&0o022)
  for parent in p.parents:
   ps=parent.stat();demand(ps.st_uid==0 and(not ps.st_mode&0o022 or stat.S_ISDIR(ps.st_mode)and ps.st_mode&stat.S_ISVTX))
 return p.read_bytes()
def load_packet(p,owned=True):
 p=pathlib.Path(p);raw=regular(p/'PACKAGE-MANIFEST.json',owned=owned);m=json.loads(raw)
 demand(m['purpose']=='connect-image-normal-install-v1'and m['defaultEnabled'] is False and 20<=len(m['files'])<=128)
 files={};total=0
 for row in m['files']:
  name=row['path'];parts=pathlib.PurePosixPath(name).parts
  demand(isinstance(name,str)and not name.startswith('/')and '\\'not in name and all(x not in ('..','.')for x in parts)and len(parts)>1 and name not in files)
  demand(name.startswith(('packages/chat/src/','supabase/runtime/','supabase/candidates/image-message/normal-activation/')))
  demand(not re.search(r'(?:^|/)(?:\.env|credential-private|node_modules|output)(?:[./]|$)',name))
  data=regular(p/name,owned=owned);demand(digest(data)==row['sha256']and len(data)==row['bytes']);total+=len(data);demand(total<=8*1024*1024);files[name]=data
 for name in [NORMAL+'entry.mjs',NORMAL+'codec-connection.py',*[NORMAL+'systemd/'+x for x in UNITS]]:demand(name in files)
 return files,digest(raw)
def validate_config(c):
 demand(set(c)=={'schemaVersion','enabled','projectRef','inspectorId','decoderImage','stateRoot','sessionPolicy','publishableKey','publicAnonKey','companyIds'})
 demand(c['schemaVersion']==1 and c['enabled']is False and c['projectRef']=='ibdlvlwdzmsrbqadrudb'and c['inspectorId']==ACTOR and c['decoderImage']==IMAGE and c['stateRoot']=='/var/lib/connect-image-inspector'and c['sessionPolicy']=='fresh-password-session-v1'and c['companyIds']==[CO])
 def anon(key):
  demand(isinstance(key,str)and len(key)<=4096 and len(key.split('.'))==3)
  part=key.split('.')[1];body=json.loads(base64.urlsafe_b64decode(part+'='*((-len(part))%4)));demand(body.get('role')=='anon'and body.get('ref')=='ibdlvlwdzmsrbqadrudb')
 anon(c['publicAnonKey']);key=c['publishableKey'];demand(isinstance(key,str)and re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]{20,200}',key)is not None)
 demand('REPLACE_'not in key);return c
def runtime_files(p,owned=True):
 p=pathlib.Path(p);manifest=regular(p/'RUNTIME-MANIFEST.json',owned=owned);demand(digest(manifest)==RUNTIME_MANIFEST);m=json.loads(manifest);demand(3<=len(m)<=128)
 out={};total=0
 allowed={'ld-linux-x86-64.so.2','libc.so.6','libm.so.6','libz.so.1','libpthread.so.0','librt.so.1','libdl.so.2','libgcc_s.so.1','libatomic.so.1'}
 for name,fp in m.items():
  demand(name in {'usr/local/bin/'+x for x in BIN}or name.startswith('usr/lib/x86_64-linux-gnu/')and name.split('/')[-1]in allowed)
  data=regular(p/name,64*1024*1024,owned);demand(data.startswith(b'\x7fELF\x02\x01\x01')and digest(data)==fp);total+=len(data);demand(total<=128*1024*1024);out[name]=data
 for name,fp in BIN.items():demand(digest(out['usr/local/bin/'+name])==fp)
 demand('usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'in out);out['RUNTIME-MANIFEST.json']=manifest
 return out,digest(manifest)
def command(args,timeout=35):
 r=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C'})
 demand(r.returncode==0);return r.stdout
def atomic(p,data,mode=0o644):
 p=pathlib.Path(p);demand(not p.is_symlink());fd,tmp=tempfile.mkstemp(prefix='.connect-image-',dir=p.parent)
 try:
  os.fchmod(fd,mode)
  with os.fdopen(fd,'wb')as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(tmp,p)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def save(m):atomic(JOURNAL/'receipt.json',(json.dumps(m,indent=2)+'\n').encode(),0o600)
def read_receipt():return json.loads(regular(JOURNAL/'receipt.json',65536))
def partial_rollback(m):
 # An incomplete OFF installation has never enabled units. Verify each recorded
 # own unit before removing it; retain all partial source/state as evidence.
 demand(m['purpose']=='connect-image-normal-install-v1'and m['phase']in('installing-off','failed-off','uninstalled-off'))
 if m['phase']=='uninstalled-off':return
 demand(not(ETC/'ENABLED').exists())
 for name,fp in m['unitHashes'].items():
  demand(name in UNITS);p=pathlib.Path('/etc/systemd/system')/name
  if not p.exists():continue
  demand(digest(regular(p))==fp);p.unlink()
 if m['unitHashes']:command(['/usr/bin/systemctl','daemon-reload'])
 m['phase']='uninstalled-off';m['unitHashes']={};save(m)
def ensure_dir(p,mode=0o755):
 p=pathlib.Path(p)
 if not p.exists():p.mkdir(mode=mode)
 demand(p.is_dir()and not p.is_symlink()and p.stat().st_uid==0 and not p.stat().st_mode&0o022)
def private_identity():
 import pwd,grp
 for name in ('connect-image-inspector','connect-image-decoder'):
  u=pwd.getpwnam(name);g=grp.getgrnam(name);demand(u.pw_uid not in(0,999)and u.pw_gid not in(0,987)and u.pw_gid==g.gr_gid and u.pw_shell in('/usr/sbin/nologin','/sbin/nologin')and set(os.getgrouplist(name,u.pw_gid))=={u.pw_gid})
 demand(pwd.getpwnam('connect-image-inspector').pw_uid!=pwd.getpwnam('connect-image-decoder').pw_uid)
 return pwd.getpwnam('connect-image-inspector')
def verify_install(m):
 demand(m['purpose']=='connect-image-normal-install-v1'and m['phase']in('installed-off','enabled','disabled','uninstalled-off'))
 for name,fp in m['installedFiles'].items():demand(digest(regular(ROOT/name,128*1024*1024))==fp)
 for name,fp in m['unitHashes'].items():demand(digest(regular(pathlib.Path('/etc/systemd/system')/name))==fp)
 private_identity();c=validate_config({**json.loads(regular(ETC/'config.json',16384)),'enabled':False});demand(digest((json.dumps(c,indent=2)+'\n').encode())==m['publicConfigSha256'])
def disable(m):
 # Remove admission before stopping. Stop only these own units, never audio/Palworld.
 if (ETC/'ENABLED').exists():regular(ETC/'ENABLED',64);(ETC/'ENABLED').unlink()
 c=json.loads(regular(ETC/'config.json',16384));c['enabled']=False;atomic(ETC/'config.json',(json.dumps(c,indent=2)+'\n').encode())
 command(['/usr/bin/systemctl','disable','--now','connect-image-inspector.service','connect-image-codec.socket'])
 # socket instances finish or are killed by their 20s RuntimeMax; never wild-card stop.
 rows=command(['/usr/bin/systemctl','list-units','--all','--plain','--no-legend','connect-image-codec@*.service']).decode().splitlines()
 names=[x.split()[0]for x in rows if x.split()]
 demand(all(re.fullmatch(r'connect-image-codec@[-A-Za-z0-9_.:]+\.service',x)for x in names))
 if names:command(['/usr/bin/systemctl','stop',*names])
 for name in ('connect-image-inspector.service','connect-image-codec.socket',*names):
  status=command(['/usr/bin/systemctl','show',name,'--property=ActiveState','--value']).decode().strip();demand(status in('inactive','failed'))
 m['phase']='disabled';save(m)
def install(package,runtime,config):
 files,packet=load_packet(package);rf,runtimehash=runtime_files(runtime);c=validate_config(json.loads(regular(config,16384)))
 configdata=(json.dumps(c,indent=2)+'\n').encode();node=regular(NODE,128*1024*1024)
 demand(node[:4]==b'\x7fELF');nodehash=digest(node)
 if (JOURNAL/'receipt.json').exists():
  old=read_receipt();demand(old['packetSha256']==packet and old['runtimeManifestSha256']==runtimehash and old['nodeSha256']==nodehash and old['publicConfigSha256']==digest(configdata));verify_install(old)
  return {'state':'already-installed-no-change','phase':old['phase'],'packetSha256':packet}
 demand(not ROOT.exists()and not ETC.exists()and not STATE.exists())
 demand(all(not pathlib.Path('/etc/systemd/system',x).exists()for x in UNITS))
 # Credential is checked by metadata ONLY, never opened/read/copied by this installer.
 s=CUSTODY.lstat();demand(stat.S_ISREG(s.st_mode)and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1)
 for p in [CUSTODY,*CUSTODY.parents]:demand(not p.is_symlink())
 ensure_dir(JOURNAL,0o700);m={'purpose':'connect-image-normal-install-v1','phase':'installing-off','packetSha256':packet,'runtimeManifestSha256':runtimehash,'nodeSha256':nodehash,'publicConfigSha256':digest(configdata),'installedFiles':{},'unitHashes':{}};save(m)
 try:
  sysusers=files[NORMAL+'systemd/connect-image-inspector.sysusers.conf'];sf=JOURNAL/'sysusers.conf';atomic(sf,sysusers)
  # Existing names are accepted only with the exact isolated identity constraints.
  command(['/usr/bin/systemd-sysusers',str(sf)]);u=private_identity()
  ROOT.mkdir(mode=0o755);os.chmod(ROOT,0o755)
  for name,data in {**files,**{'codec-runtime/'+k:v for k,v in rf.items()},'node/bin/node':node}.items():
   p=ROOT/name;p.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
   # Change only directories of this fresh own tree; independent of root umask.
   for parent in p.parents:
    if not parent.is_relative_to(ROOT):break
    demand(not parent.is_symlink()and parent.stat().st_uid==0);os.chmod(parent,0o755)
   mode=0o555 if name.startswith(('codec-runtime/usr/','node/'))else 0o444;atomic(p,data,mode);m['installedFiles'][name]=digest(data)
  ETC.mkdir(mode=0o755);os.chmod(ETC,0o755);atomic(ETC/'config.json',configdata);STATE.mkdir(mode=0o700);os.chown(STATE,u.pw_uid,u.pw_gid)
  # Write-ahead ownership hashes make interrupted file promotion reversible.
  m['unitHashes']={name:digest(files[NORMAL+'systemd/'+name])for name in UNITS};save(m)
  for name in UNITS:
   data=files[NORMAL+'systemd/'+name];atomic(pathlib.Path('/etc/systemd/system')/name,data)
  # systemd manager reload only. No enable/start, credential read or network.
  command(['/usr/bin/systemctl','daemon-reload']);m['phase']='installed-off';save(m);verify_install(m)
  return {'state':'installed-off','packetSha256':packet,'credentialRead':False,'networkCalls':0}
 except Exception:
  # Keep exact owned partial inventory for review/rollback. No recursive deletion.
  m['phase']='failed-off';save(m);raise
def main():
 demand(sys.platform=='linux'and os.geteuid()==0 and os.getuid()==0)
 import fcntl
 ensure_dir(JOURNAL,0o700)
 with open(JOURNAL/'maintenance.lock','a')as lock:
  os.chmod(lock.name,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  args=sys.argv[1:]
  if len(args)==4 and args[0]=='--install-off':result=install(*args[1:])
  elif args in(['--disable'],['--rollback'],['--enable'],['--verify']):
   m=read_receipt()
   if args==['--rollback']and m['phase']in('installing-off','failed-off','uninstalled-off'):
    partial_rollback(m);print(json.dumps({'state':'uninstalled-off','preserved':'partial files, locked accounts, source/state and original custody; no recursive deletion'}));return
   verify_install(m)
   if args==['--verify']:result={'state':m['phase'],'integrityVerified':True,'credentialRead':False}
   elif args==['--enable']:
    demand(m['phase']in('installed-off','disabled','enabled'))
    # Explicit action AFTER official SQL+Edge readback, not a public control API.
    if m['phase']!='enabled':
     c=json.loads(regular(ETC/'config.json',16384));c['enabled']=True;atomic(ETC/'config.json',(json.dumps(c,indent=2)+'\n').encode());atomic(ETC/'ENABLED',b'enabled\n')
     try:command(['/usr/bin/systemctl','enable','--now','connect-image-codec.socket','connect-image-inspector.service'])
     except Exception:disable(m);raise
     m['phase']='enabled';save(m)
    result={'state':'enabled-health-and-own-session-audit-required'}
   else:
    disable(m)
    if args==['--rollback']:
     for name in UNITS:
      p=pathlib.Path('/etc/systemd/system')/name;demand(digest(regular(p))==m['unitHashes'][name]);p.unlink()
     command(['/usr/bin/systemctl','daemon-reload']);m['phase']='uninstalled-off';m['unitHashes']={};save(m)
    result={'state':m['phase'],'preserved':'source/runtime, locked accounts, config OFF, state, original credential and logs'}
  else:raise ValueError('explicit fixed action required')
  print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception:sys.stderr.write('image-install-not-accepted; inspect own private receipt, no blind retry\n');sys.exit(1)
