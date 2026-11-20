# Offline only: parse docker image save archive; never calls Docker or Linux.
import argparse,hashlib,io,json,pathlib,posixpath,tarfile
MAX_ARCHIVE=512*1024*1024
def digest(data):return hashlib.sha256(data).hexdigest()
def safe(name):
 name=name[2:]if name.startswith('./')else name
 if not name or name.startswith('/')or '\\'in name or '..'in name.split('/'):raise ValueError('Archive path refused')
 return posixpath.normpath(name)
def prepare(archive,lock):
 if archive.stat().st_size>MAX_ARCHIVE:raise ValueError('Archive too large')
 with tarfile.open(archive,'r:*')as tf:
  members={};total=0
  for m in tf:
   if m.isdir():continue
   name=safe(m.name)
   if name in members or not m.isfile()or m.size>MAX_ARCHIVE:raise ValueError('Archive member refused')
   members[name]=m;total+=m.size
   if len(members)>4096 or total>MAX_ARCHIVE:raise ValueError('Archive budget refused')
  def get(name):
   m=members[safe(name)]
   with tf.extractfile(m)as f:return f.read()
  manifest=json.loads(get('manifest.json'))
  if not isinstance(manifest,list)or len(manifest)!=1:raise ValueError('One image required')
  image=manifest[0];config_bytes=get(image['Config'])
  if 'sha256:'+digest(config_bytes)!=lock['imageId']:raise ValueError('Image config pin mismatch')
  config=json.loads(config_bytes)
  if config.get('os')!='linux'or config.get('architecture')!='amd64'or config.get('config',{}).get('User')!='65532:65532':raise ValueError('Image identity refused')
  layers=image['Layers'];diffs=config['rootfs']['diff_ids']
  if not 1<=len(layers)<=16 or len(layers)!=len(diffs):raise ValueError('Layer inventory refused')
  tree={};layer_receipts=[]
  for name,expected in zip(layers,diffs):
   data=get(name)
   if 'sha256:'+digest(data)!=expected:raise ValueError('Layer diff_id mismatch')
   layer_receipts.append({'path':name,'diffId':expected})
   with tarfile.open(fileobj=io.BytesIO(data),mode='r:')as lt:
    count=0;size=0
    for m in lt:
     count+=1;size+=m.size
     if count>100000 or size>MAX_ARCHIVE or m.size>64*1024*1024:raise ValueError('Layer budget refused')
     p=safe(m.name);base=posixpath.basename(p);parent=posixpath.dirname(p)
     if base=='.wh..wh..opq':
      for key in list(tree):
       if key.startswith(parent+'/'):del tree[key]
      continue
     if base.startswith('.wh.'):
      target=posixpath.join(parent,base[4:])
      for key in list(tree):
       if key==target or key.startswith(target+'/'):del tree[key]
      continue
     if m.isdir():continue
     if m.isfile():
      with lt.extractfile(m)as f:tree[p]=('file',f.read())
     elif m.issym()or m.islnk():tree[p]=('link',m.linkname,m.islnk())
     # No devices/fifos ever reach the export.
  def resolve(p,seen=()):
   if p in seen or len(seen)>24:raise ValueError('Archive link refused')
   parts=p.split('/')
   for i in range(1,len(parts)+1):
    prefix='/'.join(parts[:i]);v=tree.get(prefix)
    if v and v[0]=='link':
     target=v[1]
     if '\\'in target:raise ValueError('Archive link refused')
     if target.startswith('/'):target=target[1:]
     elif not v[2]:target=posixpath.join(posixpath.dirname(prefix),target)
     target=posixpath.normpath(posixpath.join(target,*parts[i:]))
     return resolve(safe(target),seen+(p,))
   v=tree.get(p)
   if not v or v[0]!='file':raise ValueError('Runtime file missing')
   return v[1]
  names=['usr/local/bin/ffmpeg','usr/local/bin/ffprobe']
  names+=sorted(p for p in tree if p.startswith('usr/lib/x86_64-linux-gnu/')and len(p.split('/'))==4)
  if 'usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'not in names:raise ValueError('Private loader missing')
  if not 3<=len(names)<=128:raise ValueError('Runtime inventory refused')
  files={p:resolve(p)for p in names}
  for name,expected in lock['binarySha256'].items():
   data=files['usr/local/bin/'+name]
   if digest(data)!=expected or not data.startswith(b'\x7fELF'):raise ValueError('Runtime binary pin mismatch')
  return files,{'imageId':lock['imageId'],'archiveSha256':digest(archive.read_bytes()),'layers':layer_receipts,'files':len(files),'executed':False}
def export(archive,lock,out):
 files,receipt=prepare(archive,lock)
 # Nothing is written until all archive/config/layers/binary pins pass.
 out.mkdir(parents=False,exist_ok=False)
 for name,data in files.items():
  p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o555)
 manifest={name:digest(data)for name,data in sorted(files.items())}
 (out/'RUNTIME-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 (out/'EXPORT-RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
 return receipt
if __name__=='__main__':
 parser=argparse.ArgumentParser(description='Offline pinned docker-save runtime export; no daemon/credential/Linux execution')
 parser.add_argument('--archive',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,required=True)
 args=parser.parse_args()
 lock=json.loads((pathlib.Path(__file__).resolve().parents[2]/'linux-image.lock.json').read_text(encoding='utf-8-sig'))
 try:print(json.dumps(export(args.archive,lock,args.output)))
 except(Exception,)as e:
  # Only fixed class; never archive/config values or stack traces.
  print(json.dumps({'state':'export-refused','reason':type(e).__name__,'executed':False}));raise SystemExit(1)
