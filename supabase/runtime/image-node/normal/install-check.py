"""One focused local fixture check of the new installer boundary; no Linux action."""
import base64,importlib.util,json,pathlib,tempfile,hashlib,types
here=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('normal_install',here/'install-normal.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda b:hashlib.sha256(b).hexdigest()
checks=[]
with tempfile.TemporaryDirectory(prefix='connect-image-install-fixture-')as tmp:
 root=pathlib.Path(tmp);names=[m.NORMAL+'entry.mjs',m.NORMAL+'codec-connection.py',*[m.NORMAL+'systemd/'+x for x in m.UNITS]]+[m.NORMAL+'fixture-'+str(i)+'.mjs'for i in range(15)]
 rows=[]
 for name in names:
  p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'fixture-only\n');rows.append({'path':name,'bytes':13,'sha256':sha(p.read_bytes())})
 manifest={'purpose':'connect-image-normal-install-v1','defaultEnabled':False,'files':rows};(root/'PACKAGE-MANIFEST.json').write_text(json.dumps(manifest))
 files,fp=m.load_packet(root,owned=False);assert len(files)==20
 (root/names[0]).write_bytes(b'changed')
 try:m.load_packet(root,owned=False);raise AssertionError('tamper accepted')
 except ValueError:pass
 (root/names[0]).write_bytes(b'fixture-only\n');manifest['files'][0]['path']='../outside';(root/'PACKAGE-MANIFEST.json').write_text(json.dumps(manifest))
 try:m.load_packet(root,owned=False);raise AssertionError('path accepted')
 except ValueError:pass
 checks+=['manifest size/hash and traversal rejection executed with synthetic files']
 config=json.loads((here/'CONFIG.example.json').read_text());config['publishableKey']='sb_publishable_'+'synthetic_only_value_0001';payload=base64.urlsafe_b64encode(json.dumps({'role':'anon','ref':'ibdlvlwdzmsrbqadrudb'}).encode()).decode().rstrip('=');config['publicAnonKey']='synthetic.'+payload+'.synthetic';m.validate_config(config)
 bad={**config,'publicAnonKey':'synthetic.'+base64.urlsafe_b64encode(b'{"role":"service_role"}').decode().rstrip('=')+'.synthetic'}
 try:m.validate_config(bad);raise AssertionError('admin role accepted')
 except ValueError:pass
 checks+=['config defaults OFF; test-company pin and public anon role checked']
 # Exercise actual install repeat branch through fixture ports. Every mutation
 # port raises, so this proves no reinstall/reset/start on an exact repeat.
 m.JOURNAL=root; (root/'receipt.json').write_text('{}');m.NODE=root/'node';node=b'\x7fELFfixture';m.load_packet=lambda p:(files,fp);m.runtime_files=lambda p:({},'runtime-fixture');m.regular=lambda p,*a,**kw:json.dumps(config).encode()if str(p)=='public-config'else node
 old={'packetSha256':fp,'runtimeManifestSha256':'runtime-fixture','nodeSha256':sha(node),'publicConfigSha256':sha((json.dumps(config,indent=2)+'\n').encode()),'phase':'enabled'};m.read_receipt=lambda:old;m.verify_install=lambda r:None
 m.command=lambda *a,**kw:(_ for _ in()).throw(AssertionError('unexpected command'));m.atomic=m.command;m.save=m.command
 assert m.install('fixture','fixture','public-config')['state']=='already-installed-no-change'
 old['packetSha256']='conflict'
 try:m.install('fixture','fixture','public-config');raise AssertionError('conflict accepted')
 except ValueError:pass
 checks+=['exact-repeat path executes no file/service mutation; conflicting packet refused']
report={'state':'passed-focused-installer-fixture-boundary','checks':checks,'linuxInstalled':False,'systemdExecuted':False,'credentialRead':False,'networkCalls':0,'limits':'real Linux ownership/useradd/systemd/LoadCredential installation remains unexecuted; earlier transient/ELF evidence reused'}
(here/'installer-focused-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
