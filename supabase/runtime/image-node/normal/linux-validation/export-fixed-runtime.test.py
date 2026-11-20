# One grouped synthetic contract case for the new archive parser only.
import hashlib,importlib.util,io,json,pathlib,tarfile,tempfile
base=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('exporter',base/'export-fixed-runtime.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def tar(files):
 out=io.BytesIO()
 with tarfile.open(fileobj=out,mode='w')as t:
  for name,data in files.items():
   i=tarfile.TarInfo(name);i.size=len(data);t.addfile(i,io.BytesIO(data))
 return out.getvalue()
files={'usr/local/bin/ffmpeg':b'\x7fELFsynthetic-ffmpeg','usr/local/bin/ffprobe':b'\x7fELFsynthetic-ffprobe','usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2':b'\x7fELFsynthetic-loader'}
layer=tar(files);config=json.dumps({'os':'linux','architecture':'amd64','config':{'User':'65532:65532'},'rootfs':{'type':'layers','diff_ids':['sha256:'+m.digest(layer)]}}).encode()
lock={'imageId':'sha256:'+m.digest(config),'binarySha256':{n:m.digest(files['usr/local/bin/'+n])for n in ['ffmpeg','ffprobe']}}
def archive(layer_bytes):
 return tar({'config.json':config,'manifest.json':json.dumps([{'Config':'config.json','Layers':['layer.tar']}]).encode(),'layer.tar':layer_bytes})
with tempfile.TemporaryDirectory(prefix='image-runtime-parser-')as d:
 p=pathlib.Path(d);a=p/'synthetic.tar';a.write_bytes(archive(layer));r=m.export(a,lock,p/'runtime')
 assert r['files']==3 and not r['executed']
 assert json.loads((p/'runtime/RUNTIME-MANIFEST.json').read_text())=={n:m.digest(v)for n,v in files.items()}
 for label,data,other in [('wrong-config',archive(layer),{**lock,'imageId':'sha256:'+'0'*64}),('wrong-layer',archive(layer+b'x'),lock)]:
  a.write_bytes(data)
  try:m.export(a,other,p/label);raise AssertionError('Bad archive accepted')
  except ValueError:assert not(p/label).exists()
 try:m.safe('../escape');raise AssertionError('Traversal accepted')
 except ValueError:pass
print(json.dumps({'state':'passed-new-offline-archive-parser-contract','caseCount':1,'assertions':['configId','diff_ids','binaryPins','manifest','reject-before-write','pathTraversal'],'syntheticArchive':True,'realRuntimeExported':False,'realLinux':False,'daemonCalls':0,'networkCalls':0,'authCalls':0}))
